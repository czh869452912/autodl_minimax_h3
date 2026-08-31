import { reconcileMediaCatalog } from './catalog';
import type { TaskRecord } from '../tasks/types';

const completed: TaskRecord = {
  id: 'job-1', prompt: 'cinematic city', status: 'SUCCESS', resolution: '768p竖', duration: 5,
  videoUrl: 'https://cdn.test/result.mp4', localUri: 'file:///private/result.mp4', downloadState: 'DOWNLOADED',
  createdAt: 1, updatedAt: 2,
};

test('materializes normalized workflow artifacts into the app media catalog', async () => {
  const workflowJob = { id: 'job-1', workflowId: 'workflow-1', workflowVersion: '1', workflowContentHash: 'hash', adapterId: 'adapter', adapterVersion: '1', inputSnapshot: { prompt: 'cinematic city' }, status: 'SUCCEEDED' as const, createdAt: 1, updatedAt: 2 };
  const taskStore = { listMediaProjectionCandidates: jest.fn(async () => [completed]) };
  const jobStore = { get: jest.fn(async () => workflowJob), listArtifacts: jest.fn(async () => [{ id: 'video-1', jobId: 'job-1', kind: 'video' as const, uri: 'https://cdn.test/artifact.mp4' }]) };
  const mediaStore = { upsert: jest.fn(async () => undefined) };

  await reconcileMediaCatalog({ taskStore, jobStore, mediaStore });

  expect(mediaStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
    id: 'job-1:video-1', artifactId: 'video-1', workflowId: 'workflow-1',
  }));
  expect(mediaStore.upsert).toHaveBeenCalledTimes(1);
});
