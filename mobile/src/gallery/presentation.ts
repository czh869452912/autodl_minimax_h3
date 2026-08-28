import type { MediaAsset, MediaStatus } from '../media/types';
import type { TaskRecord } from '../tasks/types';

export function mediaSource(task: Pick<TaskRecord, 'localUri' | 'videoUrl'>) { return task.localUri?.trim() || task.videoUrl?.trim() || ''; }

export function taskToMediaAsset(task: TaskRecord): MediaAsset | null {
  const source = mediaSource(task);
  if (task.status !== 'SUCCESS' || !source) return null;
  const status: MediaStatus = task.localUri ? 'downloaded' : task.downloadState === 'DOWNLOAD_FAILED' ? 'failed' : 'downloading';
  return { id: task.id, taskId: task.id, title: task.prompt.slice(0, 48) || task.id, prompt: task.prompt, sourceUrl: task.videoUrl || '', localPath: task.localUri, posterPath: task.thumbnailUrl, mimeType: 'video/mp4', durationMs: task.duration * 1000, status, createdAt: task.createdAt, updatedAt: task.updatedAt };
}

export function projectGallery(tasks: TaskRecord[], options: { query?: string; status?: 'all' | MediaStatus } = {}) {
  const query = options.query?.trim().toLowerCase() || '';
  return tasks.map(taskToMediaAsset).filter((asset): asset is MediaAsset => Boolean(asset)).filter((asset) => (!query || `${asset.prompt} ${asset.taskId}`.toLowerCase().includes(query)) && (!options.status || options.status === 'all' || asset.status === options.status));
}
