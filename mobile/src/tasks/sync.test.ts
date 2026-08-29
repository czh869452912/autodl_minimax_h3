const task = {
  id: 'task-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5,
  videoUrl: 'https://example/video.mp4', createdAt: 1, updatedAt: 2,
};
let mockUpdate: ((patch: Record<string, unknown>) => Promise<void>) | undefined;
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('./repository', () => ({ createTaskRepository: jest.fn(() => ({
  list: jest.fn(async () => [{
    id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    videoUrl: 'https://example/video.mp4', createdAt: 1, updatedAt: 2,
  }]),
  upsert: jest.fn(async () => undefined),
})) }));
jest.mock('../settings/storage', () => ({ readSettings: jest.fn(async () => ({
  token: '', llmEndpoint: '', llmModel: '', llmApiKey: '', llmTimeoutSeconds: '600', llmMaxRetries: '2',
  autoExportToGallery: true, keepPrivateCopy: true,
})) }));
jest.mock('./api', () => ({ getTask: jest.fn() }));
jest.mock('./download', () => ({ downloadTask: jest.fn(async () => task) }));
jest.mock('./media', () => ({ ensureTaskMedia: jest.fn(async (value, options) => {
  mockUpdate = options.onUpdate;
  return { ...value, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'EXPORTING' };
}) }));

import { ensureTaskMedia } from './media';
import { syncTasks } from './sync';

it('routes newly completed media through the shared delivery orchestrator', async () => {
  await syncTasks();
  expect(ensureTaskMedia).toHaveBeenCalledWith(task, expect.objectContaining({
    policy: { autoExportToGallery: true, keepPrivateCopy: true },
  }));
  await mockUpdate?.({ localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' });
  await mockUpdate?.({ exportState: 'EXPORTING' });
  const repositoryFactory = jest.requireMock('./repository').createTaskRepository;
  const repository = repositoryFactory.mock.results[0].value;
  expect(repository.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'EXPORTING' }));
});
