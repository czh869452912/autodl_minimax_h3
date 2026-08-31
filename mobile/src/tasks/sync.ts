import { readSettings } from '../settings/storage';
import { getTask } from './api';
import { createTaskRepository } from './repository';
import { openDatabaseSync } from 'expo-sqlite';
import { ensureTaskMedia } from './media';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createTaskSyncCoordinator } from './coordinator';
import { createSqliteMediaStore } from '../media/repository';
import { materializeJobArtifacts, materializeTaskMedia } from '../media/materializer';

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
  legacySync: getTask,
  ensureMedia: (task, settings, onUpdate) => ensureTaskMedia(task, { policy: { autoExportToGallery: settings.autoExportToGallery, keepPrivateCopy: settings.keepPrivateCopy }, onUpdate }),
});

let mediaMigration: Promise<void> | undefined;
function ensureLegacyMediaMigration() {
  if (!mediaMigration) mediaMigration = taskStore.list().then(async (tasks) => { for (const task of tasks) if ((task.status === 'SUCCESS' || task.status === 'PARTIAL_SUCCESS') && (task.localUri || task.videoUrl)) { const job = await jobStore.get(task.id); const artifacts = job ? await jobStore.listArtifacts(job.id) : []; if (job && artifacts.length) await materializeJobArtifacts(job, artifacts, mediaStore, task); else await materializeTaskMedia(task, mediaStore); } });
  return mediaMigration;
}

export async function syncTaskRun(reason: 'foreground' | 'background' | 'service' = 'foreground') { await ensureLegacyMediaMigration(); return coordinator.run({ reason }); }
export async function syncTasks() { return (await syncTaskRun()).tasks; }
