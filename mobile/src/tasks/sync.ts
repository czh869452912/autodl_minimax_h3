import { readSettings } from '../settings/storage';
import { createTaskRepository } from './repository';
import { getDatabase } from '../storage/databaseClient';
import { ensureTaskMedia } from './media';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createTaskSyncCoordinator } from './coordinator';
import { createSqliteMediaStore } from '../media/repository';
import { withSchedulerLease } from './scheduler';

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
  const result = await withSchedulerLease('status-sync', () => coordinator.run({ reason, taskIds }), { db: database as never });
  if (result) return result;
  const tasks = await taskStore.listActive();
  return { tasks, summary: { updated: 0, failed: 0, skipped: 0, remaining: tasks.length } };
}
export async function syncTasks() { return (await syncTaskRun()).tasks; }
