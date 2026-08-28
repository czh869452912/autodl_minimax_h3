import { readSettings } from '../settings/storage';
import { getTask } from './api';
import { createTaskRepository } from './repository';
import { openDatabaseSync } from 'expo-sqlite';
import { downloadTask } from './download';

export const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));

export async function syncTasks() {
  const settings = await readSettings();
  const tasks = await taskStore.list();
  if (settings.token) {
    for (const task of tasks.filter((item) => item.status === 'QUEUED' || item.status === 'RUNNING')) {
      await taskStore.upsert(await getTask(settings.token, task));
    }
  }
  const successful = await taskStore.list();
  for (const task of successful.filter((item) => item.status === 'SUCCESS' && item.videoUrl && !item.localUri)) {
    try { await downloadTask(task, { onUpdate: async (patch) => taskStore.upsert({ ...task, ...patch }) }); } catch {}
  }
  return taskStore.list();
}
