import * as FileSystem from 'expo-file-system/legacy';
import { exportVideo } from '../native/media';
import type { AppSettings } from '../settings/storage';
import { downloadTask } from './download';
import { assertArtifactDownloadPolicy } from './downloadPolicy';
import type { TaskRecord } from './types';
import { resolveLocalVideoSource } from './localMedia';
import type { MediaAsset } from '../media/types';

export type MediaPolicy = Pick<AppSettings, 'autoExportToGallery' | 'keepPrivateCopy'>;

export type MediaDeps = {
  download: typeof downloadTask;
  publish: typeof exportVideo;
  removePrivate(uri: string): Promise<void>;
  resolveLocal(task: TaskRecord, asset?: Pick<MediaAsset, 'localPath'> | null): Promise<string | undefined>;
};

export type EnsureMediaOptions = {
  policy: MediaPolicy;
  onUpdate(patch: Partial<TaskRecord>): Promise<void>;
  allowedHosts?: string[];
  allowProviderSuppliedPublicHosts?: boolean;
  maxBytes?: number;
  acceptedMimes?: string[];
  timeoutMs?: number;
  asset?: Pick<MediaAsset, 'localPath'> | null;
  deps?: MediaDeps;
};

const defaultDeps: MediaDeps = {
  download: downloadTask,
  publish: exportVideo,
  removePrivate: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
  resolveLocal: (task, asset) => resolveLocalVideoSource({ task, asset }),
};

const taskMediaTails = new Map<string, Promise<void>>();

async function withTaskMediaLock<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
  const previous = taskMediaTails.get(taskId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  taskMediaTails.set(taskId, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (taskMediaTails.get(taskId) === tail) taskMediaTails.delete(taskId);
  }
}

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
  // The system gallery URI is delivery metadata, not a canonical media
  // source. Re-export only from an app-private file.
  const source = value.localUri;
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
  const deps = options.deps ?? defaultDeps;
  const recovered = await deps.resolveLocal(task, options.asset);
  if (recovered) {
    const patch = { localUri: recovered, downloadState: 'DOWNLOADED' as const, downloadError: undefined, downloadProgress: 1, updatedAt: Date.now() };
    await options.onUpdate(patch);
    return { task: { ...task, ...patch }, downloadedNow: false };
  }
  let current = task;
  if (current.localUri) {
    const patch = { localUri: undefined, downloadState: 'IDLE' as const, downloadError: undefined, downloadProgress: undefined, updatedAt: Date.now() };
    current = { ...current, ...patch };
    await options.onUpdate(patch);
  }
  if (!current.videoUrl) return { task: current, downloadedNow: false };
  assertArtifactDownloadPolicy(options.allowedHosts, options.allowProviderSuppliedPublicHosts);
  const downloaded = await deps.download(current, {
    onUpdate: async (patch) => {
      current = { ...current, ...patch };
      await options.onUpdate(patch);
    },
    allowedHosts: options.allowedHosts,
    allowProviderSuppliedPublicHosts: options.allowProviderSuppliedPublicHosts,
    maxBytes: options.maxBytes,
    acceptedMimes: options.acceptedMimes,
    timeoutMs: options.timeoutMs,
  });
  return { task: { ...current, ...downloaded }, downloadedNow: true };
}

async function ensureTaskMediaUnlocked(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  const result = await downloadIfNeeded(task, options);
  const shouldResume = result.task.exportState === 'QUEUED' || result.task.exportState === 'EXPORTING';
  if (shouldResume || (result.downloadedNow && options.policy.autoExportToGallery)) return publishTask(result.task, options);
  return result.task;
}

async function exportTaskVideoUnlocked(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  const result = await downloadIfNeeded(task, options);
  const published = await publishTask(result.task, options);
  if (published.exportState === 'EXPORT_FAILED' && !result.task.localUri && result.task.videoUrl) {
    const redownloaded = await downloadIfNeeded({ ...result.task, galleryUri: undefined, exportState: 'NOT_REQUESTED' }, options);
    if (redownloaded.downloadedNow) return publishTask(redownloaded.task, options);
  }
  return published;
}

export function ensureTaskDownloaded(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  return withTaskMediaLock(task.id, async () => (await downloadIfNeeded(task, options)).task);
}

export function ensureTaskMedia(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  return withTaskMediaLock(task.id, () => ensureTaskMediaUnlocked(task, options));
}

export function exportTaskVideo(task: TaskRecord, options: EnsureMediaOptions): Promise<TaskRecord> {
  return withTaskMediaLock(task.id, () => exportTaskVideoUnlocked(task, options));
}
