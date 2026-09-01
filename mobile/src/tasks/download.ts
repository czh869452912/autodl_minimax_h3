import * as FileSystem from 'expo-file-system/legacy';
import type { TaskRecord, DownloadState } from './types';
import { extractPoster } from '../native/media';
import { resolveArtifactRedirects, validateArtifactUrl, validateDownloadResult, DEFAULT_VIDEO_DOWNLOAD_BYTES } from './downloadPolicy';

export function nextDownloadState(task: Pick<TaskRecord, 'videoUrl' | 'localUri' | 'downloadState'>, event: 'enqueue' | 'start' | 'progress' | 'success' | 'failure'): DownloadState {
  if (event === 'success' || task.localUri) return 'DOWNLOADED';
  if (event === 'failure') return 'DOWNLOAD_FAILED';
  if (event === 'start' || event === 'progress') return 'DOWNLOADING';
  if (event === 'enqueue') return 'ENQUEUED';
  return task.downloadState || (task.videoUrl ? 'IDLE' : 'DOWNLOAD_FAILED');
}

export async function downloadTask(task: TaskRecord, options: { onUpdate?: (patch: Partial<TaskRecord>) => Promise<void>; allowedHosts?: string[]; maxBytes?: number; acceptedMimes?: string[]; fetcher?: typeof fetch } = {}): Promise<TaskRecord> {
  if (!task.videoUrl) throw new Error('任务没有可下载的视频地址');
  if (task.localUri) {
    const info = await FileSystem.getInfoAsync(task.localUri);
    if (info.exists) return { ...task, downloadState: 'DOWNLOADED' };
  }
  const remoteUrl = await resolveArtifactRedirects(task.videoUrl, { allowedHosts: options.allowedHosts, fetcher: options.fetcher });
  const dir = `${FileSystem.documentDirectory || ''}media`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const target = `${dir}/${task.id}.mp4`;
  const partial = `${target}.part`;
  await options.onUpdate?.({ downloadState: 'ENQUEUED', downloadProgress: 0, updatedAt: Date.now() });
  try {
    await FileSystem.deleteAsync(partial, { idempotent: true });
    await options.onUpdate?.({ downloadState: 'DOWNLOADING', downloadProgress: 0, updatedAt: Date.now() });
    const resumableFactory = (FileSystem as typeof FileSystem & { createDownloadResumable?: Function }).createDownloadResumable;
    let oversized = false;
    let resumable: { downloadAsync: () => Promise<any>; cancelAsync?: () => Promise<void> } | undefined;
    const result = resumableFactory
      ? await (resumable = resumableFactory(remoteUrl, partial, {}, (progress: { totalBytesWritten: number }) => {
        if (progress.totalBytesWritten > (options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES)) { oversized = true; void resumable?.cancelAsync?.(); }
      })).downloadAsync()
      : await FileSystem.downloadAsync(remoteUrl, partial);
    if (oversized) throw new Error('下载文件大小超过限制');
    if (!result) throw new Error('下载未返回文件');
    const info = await FileSystem.getInfoAsync(result.uri);
    const downloadedSize = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
    validateDownloadResult({ status: result?.status ?? 200, headers: result?.headers, size: downloadedSize }, { maxBytes: options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES, acceptedMimes: options.acceptedMimes });
    await FileSystem.moveAsync({ from: result.uri, to: target });
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
