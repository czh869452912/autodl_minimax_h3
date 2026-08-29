import * as FileSystem from 'expo-file-system/legacy';
import { exportVideo } from '../native/media';
import type { AppSettings } from '../settings/storage';
import { downloadTask } from './download';
import type { TaskRecord } from './types';

export type MediaPolicy = Pick<AppSettings, 'autoExportToGallery' | 'keepPrivateCopy'>;

export type MediaDeps = {
  download: typeof downloadTask;
  publish: typeof exportVideo;
  removePrivate(uri: string): Promise<void>;
};

export type EnsureMediaOptions = {
  policy: MediaPolicy;
  onUpdate(patch: Partial<TaskRecord>): Promise<void>;
  deps?: MediaDeps;
};

type MigrationOptions = Omit<EnsureMediaOptions, 'onUpdate'> & {
  onUpdate(task: TaskRecord, patch: Partial<TaskRecord>): Promise<void>;
};

const defaultDeps: MediaDeps = {
  download: downloadTask,
  publish: exportVideo,
  removePrivate: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '保存到系统相册失败';
}

async function publishTask(current: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  const deps = options.deps ?? defaultDeps;
  let value = current;
  const update = async (patch: Partial<TaskRecord>) => {
    value = { ...value, ...patch };
    await options.onUpdate(patch);
  };
  const source = value.localUri || value.galleryUri;
  if (!source) return { ...value, exportState: 'EXPORT_FAILED', exportError: '视频源文件不可用' };

  await update({ exportState: 'QUEUED', exportError: undefined, updatedAt: Date.now() });
  await update({ exportState: 'EXPORTING', exportError: undefined, updatedAt: Date.now() });
  try {
    const result = await deps.publish(source, { mediaId: value.id, displayName: `${value.id}.mp4` });
    await update({ galleryUri: result.uri, exportState: 'EXPORTED', exportError: undefined, exportedAt: Date.now(), updatedAt: Date.now() });
    if (!options.policy.keepPrivateCopy && value.localUri) {
      const privateUri = value.localUri;
      try {
        await deps.removePrivate(privateUri);
        await update({ localUri: undefined, updatedAt: Date.now() });
      } catch {
        // Publication succeeded. Retaining an undeleted private copy is safe.
      }
    }
  } catch (error) {
    await update({ exportState: 'EXPORT_FAILED', exportError: errorMessage(error), updatedAt: Date.now() });
  }
  return value;
}

async function downloadIfNeeded(task: TaskRecord, options: EnsureMediaOptions): Promise<{ task: TaskRecord; downloadedNow: boolean }> {
  if (task.localUri || task.galleryUri || !task.videoUrl) return { task, downloadedNow: false };
  let current = task;
  const downloaded = await (options.deps ?? defaultDeps).download(task, {
    onUpdate: async (patch) => {
      current = { ...current, ...patch };
      await options.onUpdate(patch);
    },
  });
  return { task: { ...current, ...downloaded }, downloadedNow: true };
}

export async function ensureTaskMedia(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  const result = await downloadIfNeeded(task, options);
  const shouldResume = result.task.exportState === 'QUEUED' || result.task.exportState === 'EXPORTING';
  if (shouldResume || (result.downloadedNow && options.policy.autoExportToGallery)) return publishTask(result.task, options);
  return result.task;
}

export async function exportTaskVideo(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  const result = await downloadIfNeeded(task, options);
  const published = await publishTask(result.task, options);
  if (published.exportState === 'EXPORT_FAILED' && !result.task.localUri && result.task.videoUrl) {
    const redownloaded = await downloadIfNeeded({ ...result.task, galleryUri: undefined, exportState: 'NOT_REQUESTED' }, options);
    if (redownloaded.downloadedNow) return publishTask(redownloaded.task, options);
  }
  return published;
}

export async function migrateDownloadedVideos(tasks: TaskRecord[], options: MigrationOptions): Promise<{ exported: number; failed: number }> {
  let exported = 0;
  let failed = 0;
  const eligible = tasks.filter((task) => task.localUri && task.exportState !== 'EXPORTED');
  for (const task of eligible) {
    let current = task;
    const result = await exportTaskVideo(task, {
      policy: options.policy,
      deps: options.deps,
      onUpdate: async (patch) => {
        current = { ...current, ...patch };
        await options.onUpdate(current, patch);
      },
    });
    if (result.exportState === 'EXPORTED') exported += 1;
    else failed += 1;
  }
  return { exported, failed };
}
