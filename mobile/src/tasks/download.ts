import * as FileSystem from 'expo-file-system/legacy';
import type { TaskRecord, DownloadState } from './types';
import { extractPoster } from '../native/media';

export function nextDownloadState(task: Pick<TaskRecord, 'videoUrl' | 'localUri' | 'downloadState'>, event: 'enqueue' | 'start' | 'progress' | 'success' | 'failure'): DownloadState {
  if (event === 'success' || task.localUri) return 'DOWNLOADED';
  if (event === 'failure') return 'DOWNLOAD_FAILED';
  if (event === 'start' || event === 'progress') return 'DOWNLOADING';
  if (event === 'enqueue') return 'ENQUEUED';
  return task.downloadState || (task.videoUrl ? 'IDLE' : 'DOWNLOAD_FAILED');
}

export async function downloadTask(task: TaskRecord, options: { onUpdate?: (patch: Partial<TaskRecord>) => Promise<void> } = {}): Promise<TaskRecord> {
  if (!task.videoUrl) throw new Error('任务没有可下载的视频地址');
  if (task.localUri) {
    const info = await FileSystem.getInfoAsync(task.localUri);
    if (info.exists) return { ...task, downloadState: 'DOWNLOADED' };
  }
  const dir = `${FileSystem.documentDirectory || ''}media`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const target = `${dir}/${task.id}.mp4`;
  const partial = `${target}.part`;
  await options.onUpdate?.({ downloadState: 'ENQUEUED', downloadProgress: 0, updatedAt: Date.now() });
  try {
    await FileSystem.deleteAsync(partial, { idempotent: true });
    await options.onUpdate?.({ downloadState: 'DOWNLOADING', downloadProgress: 0, updatedAt: Date.now() });
    const result = await FileSystem.downloadAsync(task.videoUrl, partial);
    await FileSystem.moveAsync({ from: result.uri, to: target });
    let thumbnailUrl = task.thumbnailUrl;
    try { thumbnailUrl = await extractPoster(target, task.id); } catch {}
    const complete = { ...task, localUri: target, thumbnailUrl, downloadState: 'DOWNLOADED' as const, downloadProgress: 1, downloadError: undefined, updatedAt: Date.now() };
    await options.onUpdate?.(complete);
    return complete;
  } catch (error) {
    const failed = { downloadState: 'DOWNLOAD_FAILED' as const, downloadError: error instanceof Error ? error.message : '视频下载失败', updatedAt: Date.now() };
    await options.onUpdate?.(failed);
    throw Object.assign(new Error(failed.downloadError), { cause: error });
  }
}
