import * as FileSystem from 'expo-file-system/legacy';
import type { TaskRecord, DownloadState } from './types';
import { extractPoster } from '../native/media';
import { downloadArtifact, DEFAULT_VIDEO_DOWNLOAD_BYTES } from './downloadPolicy';

export function nextDownloadState(task: Pick<TaskRecord, 'videoUrl' | 'localUri' | 'downloadState'>, event: 'enqueue' | 'start' | 'progress' | 'success' | 'failure'): DownloadState {
  if (event === 'success' || task.localUri) return 'DOWNLOADED';
  if (event === 'failure') return 'DOWNLOAD_FAILED';
  if (event === 'start' || event === 'progress') return 'DOWNLOADING';
  if (event === 'enqueue') return 'ENQUEUED';
  return task.downloadState || (task.videoUrl ? 'IDLE' : 'DOWNLOAD_FAILED');
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (b == null ? 0 : b >> 4)];
    output += b == null ? '=' : chars[((b & 15) << 2) | (c == null ? 0 : c >> 6)];
    output += c == null ? '=' : chars[c & 63];
  }
  return output;
}

export async function downloadTask(task: TaskRecord, options: { onUpdate?: (patch: Partial<TaskRecord>) => Promise<void>; allowedHosts?: string[]; maxBytes?: number; acceptedMimes?: string[]; timeoutMs?: number; fetcher?: typeof fetch } = {}): Promise<TaskRecord> {
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
    await downloadArtifact(task.videoUrl, {
      allowedHosts: options.allowedHosts ?? [],
      maxBytes: options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES,
      acceptedMimes: options.acceptedMimes,
      timeoutMs: options.timeoutMs,
      fetcher: options.fetcher,
      writer: (chunk, append) => FileSystem.writeAsStringAsync(partial, bytesToBase64(chunk), { encoding: 'base64', append }),
    });
    await FileSystem.moveAsync({ from: partial, to: target });
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
