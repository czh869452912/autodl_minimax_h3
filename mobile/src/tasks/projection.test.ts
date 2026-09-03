import { jobToTaskProjection } from './projection';

test('projects a new workflow job and its primary artifact into the task view', () => {
  const task = jobToTaskProjection({
    id: 'job-1', revision: 0, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
    adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'hello', resolution: '768p竖', duration: 5 },
    status: 'SUCCEEDED', createdAt: 1, updatedAt: 2,
  }, [{ id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn/video.mp4', mime: 'video/mp4' }]);

  expect(task).toMatchObject({ id: 'job-1', status: 'SUCCESS', prompt: 'hello', videoUrl: 'https://cdn/video.mp4', workflowId: 'demo' });
});
