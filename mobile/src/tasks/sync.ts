import { readSettings } from '../settings/storage';
import { getTask } from './api';
import { createTaskRepository } from './repository';
import { openDatabaseSync } from 'expo-sqlite';
import { ensureTaskMedia } from './media';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createTaskSyncCoordinator } from './coordinator';

export const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));
const jobStore = createJobRepository(openDatabaseSync('autodl-h3.db'));
const coordinator = createTaskSyncCoordinator({
  readSettings,
  taskStore,
  jobStore,
  createRuntime: (token) => createWorkflowRuntime({ adapters: createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? token : undefined }), jobs: jobStore, credentials: { get: async () => ({ ok: true }) }, id: () => `sync-${Date.now()}` }),
  legacySync: getTask,
  ensureMedia: (task, settings, onUpdate) => ensureTaskMedia(task, { policy: { autoExportToGallery: settings.autoExportToGallery, keepPrivateCopy: settings.keepPrivateCopy }, onUpdate }),
});

export async function syncTaskRun(reason: 'foreground' | 'background' | 'service' = 'foreground') { return coordinator.run({ reason }); }
export async function syncTasks() { return (await syncTaskRun()).tasks; }
