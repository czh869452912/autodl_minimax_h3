import { mediaSource, projectGallery } from './presentation';
import type { TaskRecord } from '../tasks/types';

const task: TaskRecord = { id: 'task-1', prompt: 'cinematic city', status: 'SUCCESS', resolution: '768p竖', duration: 5, videoUrl: 'https://example/video.mp4', localUri: 'file:///local.mp4', thumbnailUrl: 'file:///poster.jpg', downloadState: 'DOWNLOADED', createdAt: 1, updatedAt: 2 };

describe('gallery projection', () => {
  it('prefers local media and poster paths', () => {
    expect(mediaSource(task)).toBe('file:///local.mp4');
    expect(projectGallery([task])[0]).toMatchObject({ localPath: 'file:///local.mp4', posterPath: 'file:///poster.jpg', status: 'downloaded' });
  });
  it('only presents successful media and filters prompt/id/status', () => {
    expect(projectGallery([{ ...task, status: 'FAILED' }])).toEqual([]);
    expect(projectGallery([task], { query: 'TASK-1' })).toHaveLength(1);
    expect(projectGallery([task], { query: 'missing' })).toEqual([]);
    expect(projectGallery([task], { status: 'failed' })).toEqual([]);
  });
});
