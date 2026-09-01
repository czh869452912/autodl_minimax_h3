import { readSettings } from '../settings/storage';
import { createTaskRepository } from './repository';
import { getDatabase } from '../storage/databaseClient';
import { ensureTaskMedia } from './media';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createTaskSyncCoordinator } from './coordinator';
import { createSqliteMediaStore } from '../media/repository';

const database = getDatabase();
export const taskStore = createTaskRepository(database);
export const mediaStore = createSqliteMediaStore(database);
const jobStore = createJobRepository(database);
const coordinator = createTaskSyncCoordinator({
  readSettings,
  taskStore,
  jobStore,
  mediaStore,
  createRuntime: (token) => createWorkflowRuntime({ adapters: createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? token : undefined }), jobs: jobStore, credentials: { get: async () => ({ ok: true }) }, id: () => `sync-${Date.now()}` }),
  ensureMedia: (task, settings, onUpdate) => ensureTaskMedia(task, { policy: { autoExportToGallery: settings.autoExportToGallery, keepPrivateCopy: settings.keepPrivateCopy }, onUpdate }),
});

export async function syncTaskRun(reason: 'foreground' | 'background' | 'service' = 'foreground', taskIds?: string[]) {
  return coordinator.run({ reason, taskIds });
}
export async function syncTasks() { return (await syncTaskRun()).tasks; }
