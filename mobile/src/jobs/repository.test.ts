import { createJobRepository, jobRecordToTaskProjection, taskRecordToJobRecord } from './repository';
import type { JobRecord } from './types';

const job: JobRecord = {
  id: 'local-1', workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
  adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x' }, status: 'QUEUED', createdAt: 1, updatedAt: 2,
};

test('round-trips generic job provenance and artifacts', async () => {
  const store = createJobRepository(undefined);
  await store.upsert(job);
  await store.replaceArtifacts('local-1', [{ id: 'a1', jobId: 'local-1', kind: 'image', uri: 'https://example.test/a.png', mime: 'image/png' }]);
  expect(await store.get('local-1')).toMatchObject({ workflowId: 'demo', workflowContentHash: 'hash', inputSnapshot: { prompt: 'x' } });
  expect(await store.listArtifacts('local-1')).toMatchObject([{ kind: 'image', uri: 'https://example.test/a.png' }]);
});

test('projects a legacy task into a generic job without inventing provenance', () => {
  const task = { id: 'old', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, videoUrl: 'https://example/video', createdAt: 1, updatedAt: 2 };
  expect(taskRecordToJobRecord(task)).toMatchObject({ id: 'old', workflowId: 'legacy-h3', status: 'SUCCEEDED', inputSnapshot: { prompt: 'x', resolution: '768p竖', duration: 5 } });
  expect(jobRecordToTaskProjection(job, [{ id: 'v1', jobId: job.id, kind: 'video', uri: 'https://example/video', mime: 'video/mp4' }])).toMatchObject({ id: 'local-1', prompt: 'x', videoUrl: 'https://example/video', status: 'QUEUED' });
});

test('preserves prior task media projection when a sync has no new artifact', () => {
  const previous = { id: 'local-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, videoUrl: 'https://old/video', createdAt: 1, updatedAt: 2 };
  expect(jobRecordToTaskProjection({ ...job, status: 'SUCCEEDED' }, [], previous)).toMatchObject({ videoUrl: 'https://old/video' });
});
