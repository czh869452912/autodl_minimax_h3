import type { MediaStatus } from '../media/types';
import type { TaskRecord } from '../tasks/types';

export function mediaSource(task: Pick<TaskRecord, 'localUri' | 'videoUrl'>) { return task.localUri?.trim() || task.videoUrl?.trim() || ''; }

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
