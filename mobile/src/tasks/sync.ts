import { readSettings } from '../settings/storage';
import { getTask } from './api';
import { createTaskRepository } from './repository';
import { openDatabaseSync } from 'expo-sqlite';
import { ensureTaskMedia } from './media';
import { createJobRepository, jobRecordToTaskProjection } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';

export const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));
const jobStore = createJobRepository(openDatabaseSync('autodl-h3.db'));

export async function syncTasks() {
  const settings = await readSettings();
  const tasks = await taskStore.list();
  if (settings.token) {
    const adapters = createBuiltinProviderAdapters({ token: settings.token });
    const runtime = createWorkflowRuntime({ adapters, jobs: jobStore, credentials: { get: async () => ({ ok: true }) }, id: () => `sync-${Date.now()}` });
    for (const task of tasks.filter((item) => item.status === 'QUEUED' || item.status === 'RUNNING')) {
      if (task.workflowId && task.workflowId !== 'legacy-h3') {
        const job = await jobStore.get(task.id);
        if (job) { const updated = await runtime.sync(job); await taskStore.upsert({ ...task, ...jobRecordToTaskProjection(updated, []) }); }
      } else {
        await taskStore.upsert(await getTask(settings.token, task));
      }
    }
  }
  const successful = await taskStore.list();
  for (const task of successful.filter((item) => item.status === 'SUCCESS' && (item.videoUrl || item.localUri || item.galleryUri) && (item.downloadState !== 'DOWNLOADED' || item.exportState === 'QUEUED' || item.exportState === 'EXPORTING'))) {
    try {
      let current = task;
      await ensureTaskMedia(task, {
        policy: { autoExportToGallery: settings.autoExportToGallery, keepPrivateCopy: settings.keepPrivateCopy },
        onUpdate: async (patch) => {
          current = { ...current, ...patch };
          await taskStore.upsert(current);
        },
      });
    } catch {}
  }
  return taskStore.list();
}
