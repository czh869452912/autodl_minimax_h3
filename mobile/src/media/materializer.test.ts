import { materializeJobArtifacts } from './materializer';
import type { ArtifactRecord, JobRecord } from '../jobs/types';

const job: JobRecord = { id: 'job-1', workflowId: 'h3', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'autodl-comfyui', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'p' }, status: 'SUCCEEDED', createdAt: 1, updatedAt: 2 };
const artifacts: ArtifactRecord[] = [
  { id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn/video' },
  { id: 'image-1', jobId: 'job-1', kind: 'image', uri: 'https://cdn/image' },
  { id: 'audio-1', jobId: 'job-1', kind: 'audio', uri: 'https://cdn/audio' },
];

test('materializes each workflow artifact as an independent app media asset', async () => {
  const store = { upsert: jest.fn(async () => undefined) };
  await materializeJobArtifacts(job, artifacts, store);
  expect(store.upsert).toHaveBeenCalledTimes(3);
  expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1:video-1', artifactId: 'video-1', jobId: 'job-1', workflowId: 'h3', kind: 'video', sourceUrl: 'https://cdn/video' }));
});

test('does not create an asset from a system-gallery-only task projection', async () => {
  const store = { upsert: jest.fn(async () => undefined) };
  await materializeJobArtifacts({ ...job, id: 'job-2' }, [], store, { prompt: 'p', createdAt: 1 });
  expect(store.upsert).not.toHaveBeenCalled();
});
