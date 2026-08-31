import type { TaskRecord } from './types';
import { ensureTaskMedia, exportTaskVideo } from './media';

const task: TaskRecord = {
  id: 'task-1', prompt: 'cinematic city', status: 'SUCCESS', resolution: '768p竖', duration: 5,
  videoUrl: 'https://example/video.mp4', createdAt: 1, updatedAt: 2,
};

describe('task media delivery orchestration', () => {
  it('downloads a new result and automatically exports it', async () => {
    const downloaded = { ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' as const };
    const deps = {
      download: jest.fn().mockResolvedValue(downloaded),
      publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/7', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
      removePrivate: jest.fn().mockResolvedValue(undefined),
    };
    const result = await ensureTaskMedia(task, { policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(async () => undefined) });
    expect(deps.publish).toHaveBeenCalledWith('file:///private.mp4', { mediaId: task.id, displayName: 'task-1.mp4' });
    expect(result).toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'EXPORTED', galleryUri: 'content://media/video/7' });
  });

  it('keeps a successful download when gallery publication fails', async () => {
    const deps = {
      download: jest.fn().mockResolvedValue({ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' as const }),
      publish: jest.fn().mockRejectedValue(new Error('空间不足')),
      removePrivate: jest.fn().mockResolvedValue(undefined),
    };
    const result = await ensureTaskMedia(task, { policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(async () => undefined) });
    expect(result).toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'EXPORT_FAILED', exportError: '空间不足' });
  });

  it('does not silently export a historical private download', async () => {
    const deps = { download: jest.fn(), publish: jest.fn(), removePrivate: jest.fn() };
    await ensureTaskMedia({ ...task, localUri: 'file:///old.mp4', downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' }, { policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(async () => undefined) });
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('deletes the private copy only after a successful manual export when retention is disabled', async () => {
    const deps = {
      download: jest.fn(),
      publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/7', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
      removePrivate: jest.fn().mockResolvedValue(undefined),
    };
    const result = await exportTaskVideo({ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' }, { policy: { autoExportToGallery: true, keepPrivateCopy: false }, deps, onUpdate: jest.fn(async () => undefined) });
    expect(deps.removePrivate).toHaveBeenCalledWith('file:///private.mp4');
    expect(result).toMatchObject({ exportState: 'EXPORTED', localUri: undefined });
  });

  it('redownloads when a retained gallery reference no longer exists', async () => {
    const deps = {
      download: jest.fn().mockResolvedValue({ ...task, localUri: 'file:///restored.mp4', downloadState: 'DOWNLOADED' as const }),
      publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/8', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
      removePrivate: jest.fn().mockResolvedValue(undefined),
    };
    const result = await exportTaskVideo({ ...task, galleryUri: 'content://media/video/deleted', exportState: 'EXPORTED', localUri: undefined }, { policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(async () => undefined) });
    expect(deps.download).toHaveBeenCalled();
    expect(deps.publish).toHaveBeenCalledWith('file:///restored.mp4', { mediaId: task.id, displayName: 'task-1.mp4' });
    expect(result.galleryUri).toBe('content://media/video/8');
  });

  it('never uses a system-gallery URI as an export source', async () => {
    const deps = {
      download: jest.fn().mockResolvedValue({ ...task, localUri: 'file:///restored.mp4', downloadState: 'DOWNLOADED' as const }),
      publish: jest.fn().mockResolvedValue({ uri: 'content://media/video/9', displayName: 'task-1.mp4', relativePath: 'Movies/AutoDL-H3/', alreadyExisted: false }),
      removePrivate: jest.fn().mockResolvedValue(undefined),
    };
    await exportTaskVideo({ ...task, videoUrl: 'https://example/video.mp4', localUri: undefined, galleryUri: 'content://media/video/old', exportState: 'EXPORTED' }, { policy: { autoExportToGallery: true, keepPrivateCopy: true }, deps, onUpdate: jest.fn(async () => undefined) });
    expect(deps.publish).not.toHaveBeenCalledWith('content://media/video/old', expect.anything());
    expect(deps.publish).toHaveBeenCalledWith('file:///restored.mp4', { mediaId: task.id, displayName: 'task-1.mp4' });
  });
});
