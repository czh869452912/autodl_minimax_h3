import { reconcileMediaCatalog } from './catalog';
import type { TaskRecord } from '../tasks/types';

const completed: TaskRecord = {
  id: 'job-1', prompt: 'cinematic city', status: 'SUCCESS', resolution: '768p竖', duration: 5,
  videoUrl: 'https://cdn.test/result.mp4', localUri: 'file:///private/result.mp4', downloadState: 'DOWNLOADED',
  createdAt: 1, updatedAt: 2,
};

test('repairs only bounded completed tasks missing from the app media catalog', async () => {
  const taskStore = { listMediaProjectionCandidates: jest.fn(async () => [completed]) };
  const jobStore = { get: jest.fn(async () => undefined), listArtifacts: jest.fn(async () => []) };
  const mediaStore = { upsert: jest.fn(async () => undefined) };

  const result = await reconcileMediaCatalog({ taskStore, jobStore, mediaStore, limit: 50 });

  expect(taskStore.listMediaProjectionCandidates).toHaveBeenCalledWith(50);
  expect(mediaStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
    id: 'job-1',
    sourceUrl: 'https://cdn.test/result.mp4',
    localPath: 'file:///private/result.mp4',
    kind: 'video',
    status: 'downloaded',
  }));
  expect(result).toEqual({ scanned: 1, materialized: 1 });
});

test('prefers normalized workflow artifacts over the task-level compatibility result', async () => {
  const workflowJob = { id: 'job-1', workflowId: 'workflow-1', workflowVersion: '1', workflowContentHash: 'hash', adapterId: 'adapter', adapterVersion: '1', inputSnapshot: { prompt: 'cinematic city' }, status: 'SUCCEEDED' as const, createdAt: 1, updatedAt: 2 };
  const taskStore = { listMediaProjectionCandidates: jest.fn(async () => [completed]) };
  const jobStore = { get: jest.fn(async () => workflowJob), listArtifacts: jest.fn(async () => [{ id: 'video-1', jobId: 'job-1', kind: 'video' as const, uri: 'https://cdn.test/artifact.mp4' }]) };
  const mediaStore = { upsert: jest.fn(async () => undefined) };

  await reconcileMediaCatalog({ taskStore, jobStore, mediaStore });

  expect(mediaStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
    id: 'job-1:video-1', artifactId: 'video-1', workflowId: 'workflow-1',
  }));
  expect(mediaStore.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }));
});
