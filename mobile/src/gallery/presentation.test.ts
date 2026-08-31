import { exportStatusLabel, mediaSource, mediaStatusLabel, projectGallery } from './presentation';
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

  it('excludes queued, running, failed, cancelled, and successful tasks without a source', () => {
    const base = { ...task, localUri: undefined, videoUrl: 'https://example/video.mp4' };
    expect(projectGallery([{ ...base, status: 'QUEUED' }])).toEqual([]);
    expect(projectGallery([{ ...base, status: 'RUNNING' }])).toEqual([]);
    expect(projectGallery([{ ...base, status: 'FAILED' }])).toEqual([]);
    expect(projectGallery([{ ...base, status: 'CANCELLED' }])).toEqual([]);
    expect(projectGallery([{ ...base, status: 'SUCCESS', videoUrl: undefined }])).toEqual([]);
  });

  it('maps download lifecycle to user-facing gallery labels while retaining remote playback', () => {
    const base = { ...task, localUri: undefined, videoUrl: 'https://example/video.mp4' };
    expect(projectGallery([{ ...base, downloadState: 'DOWNLOADING' }])[0]).toMatchObject({ status: 'downloading' });
    expect(projectGallery([{ ...base, downloadState: 'DOWNLOAD_FAILED' }])[0]).toMatchObject({ status: 'failed' });
    expect(projectGallery([{ ...base, localUri: 'file:///local.mp4', downloadState: 'DOWNLOADED' }])[0]).toMatchObject({ status: 'downloaded', localPath: 'file:///local.mp4' });
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

  it('projects the gallery publication label onto video cards', () => {
    expect(projectGallery([{ ...task, galleryUri: 'content://media/video/1', exportState: 'EXPORTED' }])[0]).toMatchObject({ exportStatus: '已保存到相册' });
  });

  it('shows partial-success tasks when they contain a playable result', () => {
    expect(projectGallery([{ ...task, status: 'PARTIAL_SUCCESS' }])).toHaveLength(1);
  });
});
