const mockRuntimeSync = jest.fn();
const mockGetTask = jest.fn();

jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('./repository', () => {
  const task = { id: 'local-1', workflowId: 'autodl.minimax-h3.i2v-15s', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'autodl-comfyui', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x', resolution: '768p竖', duration: 5 }, prompt: 'x', status: 'QUEUED', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 1 };
  const store = { list: jest.fn(async () => [task]), upsert: jest.fn(async () => undefined), remove: jest.fn() };
  return { createTaskRepository: jest.fn(() => store), __store: store, __task: task };
});
jest.mock('../jobs/repository', () => {
  const job = { id: 'local-1', workflowId: 'autodl.minimax-h3.i2v-15s', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'autodl-comfyui', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x', resolution: '768p竖', duration: 5 }, remote: { providerJobId: 'remote-1' }, status: 'QUEUED', createdAt: 1, updatedAt: 1 };
  const store = { get: jest.fn(async () => job), upsert: jest.fn(), list: jest.fn(), replaceArtifacts: jest.fn(), listArtifacts: jest.fn(async () => []) };
  return { createJobRepository: jest.fn(() => store), jobRecordToTaskProjection: jest.fn((value) => ({ id: value.id, prompt: 'x', resolution: '768p竖', duration: 5, status: value.status === 'RUNNING' ? 'RUNNING' : 'QUEUED', createdAt: 1, updatedAt: value.updatedAt })), __store: store, __job: job };
});
jest.mock('../settings/storage', () => ({ readSettings: jest.fn(async () => ({ token: 'token', autoExportToGallery: false, keepPrivateCopy: true })) }));
jest.mock('../workflows/adapters/autodlComfyUi/adapter', () => ({ createAutodlComfyUiAdapter: jest.fn(() => ({ manifest: () => ({ id: 'autodl-comfyui' }) })) }));
jest.mock('../workflows/runtime/runtime', () => ({ createWorkflowRuntime: jest.fn(() => ({ sync: mockRuntimeSync })) }));
jest.mock('./api', () => ({ getTask: mockGetTask }));
jest.mock('./media', () => ({ ensureTaskMedia: jest.fn() }));

import { syncTasks } from './sync';

test('routes workflow-provenance tasks through workflow runtime', async () => {
  const jobModule = jest.requireMock('../jobs/repository');
  const taskModule = jest.requireMock('./repository');
  mockRuntimeSync.mockResolvedValueOnce({ ...jobModule.__job, status: 'RUNNING', updatedAt: 2 });
  await syncTasks();
  expect(mockRuntimeSync).toHaveBeenCalledWith(jobModule.__job);
  expect(mockGetTask).not.toHaveBeenCalled();
  expect(taskModule.__store.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', status: 'RUNNING' }));
});

