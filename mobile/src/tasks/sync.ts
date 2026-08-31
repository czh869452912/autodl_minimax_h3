import { readSettings } from '../settings/storage';
import { createTaskRepository } from './repository';
import { openDatabaseSync } from 'expo-sqlite';
import { ensureTaskMedia } from './media';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createTaskSyncCoordinator } from './coordinator';
import { createSqliteMediaStore } from '../media/repository';
import { reconcileMediaCatalog } from '../media/catalog';

const database = openDatabaseSync('autodl-h3.db');
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

export async function syncTaskRun(reason: 'foreground' | 'background' | 'service' = 'foreground') {
  try { await reconcileMediaCatalog({ taskStore, jobStore, mediaStore, limit: 200 }); } catch { /* catalog repair is best-effort and must not make task refresh fail */ }
  const result = await coordinator.run({ reason });
  try { await reconcileMediaCatalog({ taskStore, jobStore, mediaStore, limit: 200 }); } catch { /* catalog repair is best-effort and must not make task refresh fail */ }
  return result;
}
export async function syncTasks() { return (await syncTaskRun()).tasks; }
