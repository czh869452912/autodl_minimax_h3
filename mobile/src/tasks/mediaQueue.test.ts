import type { MediaAsset } from '../media/types';
import type { TaskRecord } from './types';
import { createMediaDeliveryQueue } from './mediaQueue';

test('passes the task video asset to media recovery and persists only the media projection', async () => {
  const task: TaskRecord = {
    id: 'task-1', prompt: 'demo', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    videoUrl: 'https://cdn.test/video.mp4', createdAt: 1, updatedAt: 2,
  };
  const asset: MediaAsset = {
    id: 'asset-1', taskId: task.id, title: 'demo', prompt: 'demo', sourceUrl: task.videoUrl!,
    localPath: 'file:///private.mp4', mimeType: 'video/mp4', kind: 'video', status: 'downloaded', createdAt: 1, updatedAt: 3,
  };
  const artifactPolicy = { allowedHosts: ['cdn.test'] };
  const taskStore = {
    upsert: jest.fn(async () => undefined),
    upsertMediaProjection: jest.fn(async () => undefined),
  };
  let resolveProcessed!: () => void;
  const processed = new Promise<void>((resolve) => { resolveProcessed = resolve; });
  const ensureMedia = jest.fn(async (_task, _settings, onUpdate: (patch: Partial<TaskRecord>) => Promise<void>) => {
    await onUpdate({ localUri: asset.localPath, downloadState: 'DOWNLOADED', updatedAt: 4 });
    resolveProcessed();
  });
  const mediaStore = {
    upsert: jest.fn(async () => undefined),
    getPrimaryVideoByTaskId: jest.fn(async () => asset),
  };
  const queue = createMediaDeliveryQueue({
    ensureMedia,
    getArtifactPolicy: () => artifactPolicy,
    taskStore,
    jobStore: { get: jest.fn(async () => undefined), listArtifacts: jest.fn(async () => []) },
    mediaStore,
  });

  queue.enqueue(task, { token: 'token', autoExportToGallery: false, keepPrivateCopy: true });
  await processed;

  expect(mediaStore.getPrimaryVideoByTaskId).toHaveBeenCalledWith(task.id);
  expect(ensureMedia).toHaveBeenCalledWith(task, expect.anything(), expect.any(Function), artifactPolicy, asset);
  expect(taskStore.upsertMediaProjection).toHaveBeenCalledWith(expect.objectContaining({ id: task.id, localUri: asset.localPath }));
  expect(taskStore.upsert).not.toHaveBeenCalled();
});
