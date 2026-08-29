import type { MediaAsset, MediaStatus } from '../media/types';
import type { TaskRecord } from '../tasks/types';

export function mediaSource(task: Pick<TaskRecord, 'localUri' | 'galleryUri' | 'videoUrl'>) { return task.localUri?.trim() || task.galleryUri?.trim() || task.videoUrl?.trim() || ''; }

export function mediaStatusLabel(status: MediaStatus): string {
  return status === 'downloaded' ? '已下载' : status === 'failed' ? '下载失败' : '准备中';
}

export function exportStatusLabel(task: Pick<TaskRecord, 'downloadState' | 'exportState' | 'galleryUri'>): string {
  if (task.exportState === 'EXPORTED' && task.galleryUri) return '已保存到相册';
  if (task.exportState === 'QUEUED' || task.exportState === 'EXPORTING') return '正在保存到相册';
  if (task.exportState === 'EXPORT_FAILED') return '保存到相册失败';
  if (task.downloadState === 'DOWNLOADED') return '已下载到应用';
  return '';
}

export function taskToMediaAsset(task: TaskRecord): MediaAsset | null {
  const source = mediaSource(task);
  if (task.status !== 'SUCCESS' || !source) return null;
  const localPath = task.localUri || task.galleryUri;
  const status: MediaStatus = localPath ? 'downloaded' : task.downloadState === 'DOWNLOAD_FAILED' ? 'failed' : 'downloading';
  return { id: task.id, taskId: task.id, title: task.prompt.slice(0, 48) || task.id, prompt: task.prompt, sourceUrl: task.videoUrl || '', localPath, posterPath: task.thumbnailUrl, mimeType: 'video/mp4', durationMs: task.duration * 1000, status, exportStatus: exportStatusLabel(task) || undefined, createdAt: task.createdAt, updatedAt: task.updatedAt };
}

export function projectGallery(tasks: TaskRecord[], options: { query?: string; status?: 'all' | MediaStatus } = {}) {
  const query = options.query?.trim().toLowerCase() || '';
  return tasks.map(taskToMediaAsset).filter((asset): asset is MediaAsset => Boolean(asset)).filter((asset) => (!query || `${asset.prompt} ${asset.taskId}`.toLowerCase().includes(query)) && (!options.status || options.status === 'all' || asset.status === options.status));
}
