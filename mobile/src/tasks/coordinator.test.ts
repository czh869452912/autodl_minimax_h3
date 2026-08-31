import { createTaskSyncCoordinator } from './coordinator';
import type { JobRecord } from '../jobs/types';
import type { TaskRecord } from './types';

const task = (id: string, status: TaskRecord['status'] = 'RUNNING'): TaskRecord => ({ id, prompt: id, status, resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 1 });
const job = (id: string, remote: string): JobRecord => ({ id, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: id, resolution: '768p竖', duration: 5 }, remote: { providerJobId: remote }, status: 'RUNNING', createdAt: 1, updatedAt: 1 });

function setup(tasks: TaskRecord[], jobs: JobRecord[]) {
  const taskStore = { list: jest.fn(async () => tasks), listActive: jest.fn(async () => tasks.filter((item) => ['QUEUED', 'RUNNING', 'UNKNOWN'].includes(item.status))), listSyncCandidates: jest.fn(async () => [] as TaskRecord[]), upsert: jest.fn(async (value: TaskRecord) => { const index = tasks.findIndex((item) => item.id === value.id); if (index >= 0) tasks[index] = value; }), };
  const jobStore = { get: jest.fn(async (id: string) => jobs.find((item) => item.id === id)), listArtifacts: jest.fn(async () => [{ id: 'video-1', jobId: 'local-1', kind: 'video' as const, uri: 'https://cdn.test/video' }]), upsert: jest.fn(), replaceArtifacts: jest.fn(), list: jest.fn() };
  const runtime = { sync: jest.fn(async (value: JobRecord) => ({ ...value, status: 'SUCCEEDED' as const, updatedAt: 2 })) };
  const legacySync = jest.fn(async (_token: string, value: TaskRecord) => ({ ...value, status: 'SUCCESS' as const, videoUrl: 'https://legacy/video', updatedAt: 2 }));
  const coordinator = createTaskSyncCoordinator({
    readSettings: async () => ({ token: 'token', autoExportToGallery: false, keepPrivateCopy: true }),
    taskStore, jobStore, createRuntime: () => runtime, createAdapters: () => new Map(), legacySync,
    ensureMedia: jest.fn(async () => undefined), now: () => 2,
  });
  return { coordinator, taskStore, jobStore, runtime, legacySync };
}

test('uses remote provider id and projects persisted artifacts', async () => {
  const value = setup([task('local-1')], [job('local-1', 'remote-1')]);
  const result = await value.coordinator.run();
  expect(value.runtime.sync).toHaveBeenCalledWith(expect.objectContaining({ remote: { providerJobId: 'remote-1' } }));
  expect(value.taskStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS', videoUrl: 'https://cdn.test/video' }));
  expect(result.summary).toMatchObject({ updated: 1, failed: 0 });
  expect(value.taskStore.listActive).toHaveBeenCalled();
});

test('one provider failure does not abort other jobs', async () => {
  const value = setup([task('local-1'), task('local-2')], [job('local-1', 'remote-1'), job('local-2', 'remote-2')]);
  value.runtime.sync.mockRejectedValueOnce(new Error('DNS unavailable')).mockResolvedValueOnce({ ...job('local-2', 'remote-2'), status: 'RUNNING', updatedAt: 2 } as never);
  const result = await value.coordinator.run();
  expect(result.summary).toMatchObject({ updated: 1, failed: 1 });
  expect(value.taskStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', syncError: 'DNS unavailable' }));
  expect(value.taskStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-2', status: 'RUNNING' }));
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
  const coordinator = createTaskSyncCoordinator({ readSettings: async () => ({ token: '', autoExportToGallery: false, keepPrivateCopy: true }), taskStore: value.taskStore, jobStore: value.jobStore, createRuntime: () => value.runtime, legacySync: value.legacySync, ensureMedia: jest.fn(async () => undefined), now: () => 2 });
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
  expect(value.taskStore.upsert).toHaveBeenCalledWith(expect.objectContaining({ lastSyncAt: 2, syncError: undefined }));
});
