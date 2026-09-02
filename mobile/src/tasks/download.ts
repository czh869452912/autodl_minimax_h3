import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import type { TaskRecord, DownloadState } from './types';
import { extractPoster } from '../native/media';
import { downloadArtifact, DEFAULT_VIDEO_DOWNLOAD_BYTES } from './downloadPolicy';

const downloadsInFlight = new Map<string, Promise<TaskRecord>>();

export function nextDownloadState(task: Pick<TaskRecord, 'videoUrl' | 'localUri' | 'downloadState'>, event: 'enqueue' | 'start' | 'progress' | 'success' | 'failure'): DownloadState {
  if (event === 'success' || task.localUri) return 'DOWNLOADED';
  if (event === 'failure') return 'DOWNLOAD_FAILED';
  if (event === 'start' || event === 'progress') return 'DOWNLOADING';
  if (event === 'enqueue') return 'ENQUEUED';
  return task.downloadState || (task.videoUrl ? 'IDLE' : 'DOWNLOAD_FAILED');
}

async function publishCompletedDownload(partial: string, target: string, expectedSize: number): Promise<void> {
  await FileSystem.deleteAsync(target, { idempotent: true });
  let copied = false;
  try {
    await FileSystem.moveAsync({ from: partial, to: target });
  } catch {
    try {
      await FileSystem.copyAsync({ from: partial, to: target });
      copied = true;
    } catch (copyError) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      throw copyError;
    }
  }
  const published = await FileSystem.getInfoAsync(target).catch(() => undefined);
  if (!published?.exists || published.isDirectory || published.size !== expectedSize) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    throw new Error('下载文件不完整');
  }
  if (copied) {
    await FileSystem.deleteAsync(partial, { idempotent: true });
  }
}

async function performDownloadTask(task: TaskRecord, options: { onUpdate?: (patch: Partial<TaskRecord>) => Promise<void>; allowedHosts?: string[]; allowProviderSuppliedPublicHosts?: boolean; maxBytes?: number; acceptedMimes?: string[]; timeoutMs?: number; fetcher?: typeof fetch } = {}): Promise<TaskRecord> {
  if (!task.videoUrl) throw new Error('任务没有可下载的视频地址');
  if (task.localUri) {
    const info = await FileSystem.getInfoAsync(task.localUri);
    if (info.exists) return { ...task, downloadState: 'DOWNLOADED' };
  }
  const dir = `${FileSystem.documentDirectory || ''}media`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const target = `${dir}/${task.id}.mp4`;
  const partial = `${target}.part`;
  const partialFile = new File(partial);
  await options.onUpdate?.({ downloadState: 'ENQUEUED', downloadProgress: 0, updatedAt: Date.now() });
  try {
    await FileSystem.deleteAsync(partial, { idempotent: true });
    await options.onUpdate?.({ downloadState: 'DOWNLOADING', downloadProgress: 0, updatedAt: Date.now() });
    const downloaded = await downloadArtifact(task.videoUrl, {
      allowedHosts: options.allowedHosts ?? [],
      allowProviderSuppliedPublicHosts: options.allowProviderSuppliedPublicHosts,
      maxBytes: options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES,
      acceptedMimes: options.acceptedMimes,
      timeoutMs: options.timeoutMs,
      fetcher: options.fetcher,
      writer: async (chunk, append) => { partialFile.write(chunk, { append }); },
    });
    const partialInfo = await FileSystem.getInfoAsync(partial);
    if (!partialInfo.exists || partialInfo.isDirectory || partialInfo.size !== downloaded.size) throw new Error('下载文件不完整');
    await publishCompletedDownload(partial, target, downloaded.size);
    let thumbnailUrl = task.thumbnailUrl;
    try { thumbnailUrl = await extractPoster(target, task.id); } catch {}
    const complete = { ...task, localUri: target, thumbnailUrl, downloadState: 'DOWNLOADED' as const, downloadProgress: 1, downloadError: undefined, updatedAt: Date.now() };
    await options.onUpdate?.(complete);
    return complete;
  } catch (error) {
    await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => undefined);
    const failed = { downloadState: 'DOWNLOAD_FAILED' as const, downloadError: error instanceof Error ? error.message : '视频下载失败', updatedAt: Date.now() };
    await options.onUpdate?.(failed);
    throw Object.assign(new Error(failed.downloadError), { cause: error });
  }
}

export function downloadTask(task: TaskRecord, options: { onUpdate?: (patch: Partial<TaskRecord>) => Promise<void>; allowedHosts?: string[]; allowProviderSuppliedPublicHosts?: boolean; maxBytes?: number; acceptedMimes?: string[]; timeoutMs?: number; fetcher?: typeof fetch } = {}): Promise<TaskRecord> {
  const existing = downloadsInFlight.get(task.id);
  if (existing) return existing;
  const operation = performDownloadTask(task, options);
  downloadsInFlight.set(task.id, operation);
  void operation.finally(() => {
    if (downloadsInFlight.get(task.id) === operation) downloadsInFlight.delete(task.id);
  }).catch(() => undefined);
  return operation;
}
