import { exportStatusLabel, mediaSource, mediaStatusLabel } from './presentation';
import type { TaskRecord } from '../tasks/types';

const task: TaskRecord = { id: 'task-1', prompt: 'cinematic city', status: 'SUCCESS', resolution: '768p竖', duration: 5, videoUrl: 'https://example/video.mp4', localUri: 'file:///local.mp4', thumbnailUrl: 'file:///poster.jpg', downloadState: 'DOWNLOADED', createdAt: 1, updatedAt: 2 };

describe('media presentation helpers', () => {
  it('prefers local media as the playback source', () => {
    expect(mediaSource(task)).toBe('file:///local.mp4');
    expect(mediaSource({ ...task, localUri: undefined })).toBe('https://example/video.mp4');
  });

  it('provides stable Chinese status labels', () => {
    expect(mediaStatusLabel('downloading')).toBe('准备中');
    expect(mediaStatusLabel('failed')).toBe('下载失败');
    expect(mediaStatusLabel('downloaded')).toBe('已下载');
  });

  it('keeps publication status separate from download status', () => {
    expect(exportStatusLabel({ exportState: 'EXPORTING', downloadState: 'DOWNLOADED' })).toBe('正在保存到相册');
    expect(exportStatusLabel({ exportState: 'EXPORTED', galleryUri: 'content://media/video/1', downloadState: 'DOWNLOADED' })).toBe('已保存到相册');
    expect(exportStatusLabel({ exportState: 'EXPORT_FAILED', downloadState: 'DOWNLOADED' })).toBe('保存到相册失败');
    expect(exportStatusLabel({ downloadState: 'DOWNLOADED' })).toBe('已下载到应用');
  });

});
