import { createTaskSyncCoordinator } from './coordinator';
import type { JobRecord } from '../jobs/types';
import type { TaskRecord } from './types';

const task = (id: string, status: TaskRecord['status'] = 'RUNNING'): TaskRecord => ({ id, prompt: id, status, resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 1 });
const job = (id: string, remote: string): JobRecord => ({ id, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: id, resolution: '768p竖', duration: 5 }, remote: { providerJobId: remote }, status: 'RUNNING', createdAt: 1, updatedAt: 1 });

function setup(tasks: TaskRecord[], jobs: JobRecord[]) {
  const persist = async (value: TaskRecord) => { const index = tasks.findIndex((item) => item.id === value.id); if (index >= 0) tasks[index] = value; else tasks.push(value); };
  const taskStore = { list: jest.fn(async () => tasks), listActive: jest.fn(async () => tasks.filter((item) => ['QUEUED', 'RUNNING', 'UNKNOWN'].includes(item.status))), listSyncCandidates: jest.fn(async () => [] as TaskRecord[]), upsert: jest.fn(persist), upsertWorkflowProjection: jest.fn(persist), };
  const jobStore = { get: jest.fn(async (id: string) => jobs.find((item) => item.id === id)), list: jest.fn(async () => jobs), listArtifacts: jest.fn(async () => [{ id: 'video-1', jobId: 'local-1', kind: 'video' as const, uri: 'https://cdn.test/video' }]), upsert: jest.fn(), replaceArtifacts: jest.fn() };
  const mediaStore = { upsert: jest.fn(async () => undefined), list: jest.fn(async () => []), get: jest.fn(async () => null), remove: jest.fn(async () => undefined) };
  const runtime = { sync: jest.fn(async (value: JobRecord) => ({ ...value, status: 'SUCCEEDED' as const, updatedAt: 2 })) };
  const ensureMedia = jest.fn(async () => undefined);
  const coordinator = createTaskSyncCoordinator({
    readSettings: async () => ({ token: 'token', autoExportToGallery: false, keepPrivateCopy: true }),
    taskStore, jobStore, mediaStore, createRuntime: () => runtime,
    ensureMedia, now: () => 2,
  });
  return { coordinator, taskStore, jobStore, mediaStore, runtime, ensureMedia };
}

test('persists the complete workflow projection through the media-safe write', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  value.runtime.sync.mockResolvedValueOnce({
    ...job('local-1', 'remote-1'), status: 'SUCCEEDED', startedAt: 1_500,
    executionDuration: 27, updatedAt: 2,
  } as never);

  await value.coordinator.run();

  expect(value.taskStore.upsertWorkflowProjection).toHaveBeenCalledWith(expect.objectContaining({
    id: 'local-1', status: 'SUCCESS', videoUrl: 'https://cdn.test/video', workflowId: 'demo',
    adapterId: 'demo', startedAt: 1_500, executionDuration: 27, lastSyncAt: 2,
  }));
});

test('uses remote provider id and projects persisted artifacts', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  const result = await value.coordinator.run();
  expect(value.runtime.sync).toHaveBeenCalledWith(expect.objectContaining({ remote: { providerJobId: 'remote-1' } }));
  expect(value.taskStore.upsertWorkflowProjection).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS', videoUrl: 'https://cdn.test/video' }));
  expect(result.summary).toMatchObject({ updated: 1, failed: 0 });
  expect(value.taskStore.listActive).toHaveBeenCalled();
});

test('one provider failure does not abort other jobs', async () => {
  const value = setup([task('local-1'), task('local-2')], [job('local-1', 'remote-1'), job('local-2', 'remote-2')]);
  value.runtime.sync.mockRejectedValueOnce(new Error('DNS unavailable')).mockResolvedValueOnce({ ...job('local-2', 'remote-2'), status: 'RUNNING', updatedAt: 2 } as never);
  const result = await value.coordinator.run();
  expect(result.summary).toMatchObject({ updated: 1, failed: 1 });
  expect(value.taskStore.upsertWorkflowProjection).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', syncError: 'DNS unavailable' }));
  expect(value.taskStore.upsertWorkflowProjection).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-2', status: 'RUNNING' }));
});

test('keeps active work remaining so background monitoring is not stopped early', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  value.runtime.sync.mockResolvedValueOnce({ ...job('local-1', 'remote-1'), status: 'RUNNING', updatedAt: 2 } as never);
  const result = await value.coordinator.run({ reason: 'background' });
  expect(result.summary).toMatchObject({ updated: 1, remaining: 1 });
});

test('concurrent calls share one in-flight pass', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  let release: (() => void) | undefined;
  const gate = new Promise<JobRecord>((resolve) => { release = () => resolve({ ...job('local-1', 'remote-1'), status: 'RUNNING', updatedAt: 2 }); });
  value.runtime.sync.mockReturnValueOnce(gate as never);
  const first = value.coordinator.run();
  const second = value.coordinator.run();
  release?.();
  await Promise.all([first, second]);
  expect(value.runtime.sync).toHaveBeenCalledTimes(1);
});

test('missing token returns stale tasks with an explicit offline summary', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  const coordinator = createTaskSyncCoordinator({ readSettings: async () => ({ token: '', autoExportToGallery: false, keepPrivateCopy: true }), taskStore: value.taskStore, jobStore: value.jobStore, createRuntime: () => value.runtime, ensureMedia: jest.fn(async () => undefined), now: () => 2 });
  const result = await coordinator.run();
  expect(result.tasks).toEqual([expect.objectContaining({ id: 'local-1' })]);
  expect(result.summary).toMatchObject({ skipped: 1, remaining: 1 });
  expect(value.runtime.sync).not.toHaveBeenCalled();
});

test('repairs a completed workflow task that is missing timing or result projection', async () => {
  const completed = task('local-1', 'SUCCESS');
  const value = setup([completed], [{ ...job('local-1', 'remote-1'), status: 'SUCCEEDED' }]);
  value.taskStore.listSyncCandidates.mockResolvedValueOnce([completed]);
  await value.coordinator.run();
  expect(value.runtime.sync).toHaveBeenCalled();
  expect(value.taskStore.upsertWorkflowProjection).toHaveBeenCalledWith(expect.objectContaining({ lastSyncAt: 2, syncError: undefined }));
});

test('continues media processing for partially successful workflow tasks', async () => {
  const partial = { ...task('partial-1', 'PARTIAL_SUCCESS'), videoUrl: 'https://cdn.test/partial.mp4' };
  const value = setup([partial], []);

  await value.coordinator.run();

  expect(value.ensureMedia).toHaveBeenCalledWith(partial, expect.anything(), expect.any(Function), undefined, undefined);
});

test('does not reprocess a task that only retains a system gallery delivery', async () => {
  const delivered = { ...task('gallery-only-1', 'SUCCESS'), galleryUri: 'content://media/existing', exportState: 'EXPORTED' as const };
  const value = setup([delivered], []);

  await value.coordinator.run();

  expect(value.ensureMedia).not.toHaveBeenCalled();
});

test('recovers a task projection when a persisted workflow job has no task row', async () => {
  const value = setup([], [job('orphan-job', 'remote-1')]);

  await value.coordinator.run();

  expect(value.taskStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'orphan-job', status: 'RUNNING', videoUrl: 'https://cdn.test/video' }));
});

test('does not enumerate completed jobs when an active-job query is available', async () => {
  const value = setup([task('local-1', 'RUNNING'), task('done-1', 'SUCCESS')], [job('local-1', 'remote-1')]);
  const activeJob = jest.fn(async () => [job('local-1', 'remote-1')]);
  (value.jobStore as typeof value.jobStore & { listActive?: typeof activeJob }).listActive = activeJob;
  await value.coordinator.run();
  expect(activeJob).toHaveBeenCalledTimes(1);
  expect(value.jobStore.list).not.toHaveBeenCalled();
});

test('does not run media delivery for already delivered completed tasks', async () => {
  const value = setup([{ ...task('done-1', 'SUCCESS'), videoUrl: 'https://cdn.test/video', downloadState: 'DOWNLOADED', exportState: 'EXPORTED' }], []);
  await value.coordinator.run();
  expect(value.ensureMedia).not.toHaveBeenCalled();
});

test('does not automatically retry a failed historical download', async () => {
  const value = setup([{ ...task('failed-download-1', 'SUCCESS'), videoUrl: 'https://cdn.test/video', downloadState: 'DOWNLOAD_FAILED', downloadError: '空间不足' }], []);
  await value.coordinator.run();
  expect(value.ensureMedia).not.toHaveBeenCalled();
});

test('backs off a failed provider sync on the next polling pass', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  value.runtime.sync.mockRejectedValueOnce(new Error('offline'));
  await value.coordinator.run();
  value.runtime.sync.mockClear();
  await value.coordinator.run();
  expect(value.runtime.sync).not.toHaveBeenCalled();
});

test('returns status results without waiting for delayed media delivery', async () => {
  const value = setup([{ ...task('done-1', 'SUCCESS'), videoUrl: 'https://cdn.test/video' }], []);
  let release!: () => void;
  value.ensureMedia.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }) as never);
  const result = await Promise.race([
    value.coordinator.run(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('status sync blocked on media')), 50)),
  ]);
  expect(result.summary).toBeDefined();
  release();
});

test('filters service sync to requested task ids', async () => {
  const value = setup([task('local-1'), task('local-2')], [job('local-1', 'remote-1'), job('local-2', 'remote-2')]);
  await value.coordinator.run({ reason: 'service', taskIds: ['local-2'] });
  expect(value.runtime.sync).toHaveBeenCalledTimes(1);
  expect(value.runtime.sync).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-2' }));
});
