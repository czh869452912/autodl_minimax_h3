import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseSync } from 'expo-sqlite';
import { readSettings } from '../settings/storage';
import { getTask } from './api';
import { createTaskRepository } from './repository';
import { extractPoster } from '../native/media';

export const H3_BACKGROUND_TASK = 'autodl-h3-sync';
const store = createTaskRepository(openDatabaseSync('autodl-h3.db'));

export async function syncTasks() {
  const settings = await readSettings(); if (!settings.token) return;
  const active = (await store.list()).filter((task) => task.status === 'QUEUED' || task.status === 'RUNNING');
  for (const task of active) await store.upsert(await getTask(settings.token, task));
  for (const task of await store.list()) {
    if (task.status !== 'SUCCESS' || !task.videoUrl || task.localUri) continue;
    const dir = `${FileSystem.documentDirectory || ''}media`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const result = await downloadWithRetry(task.videoUrl, `${dir}/${task.id}.mp4`);
    let thumbnailUrl = task.thumbnailUrl;
    try { thumbnailUrl = await extractPoster(result.uri, task.id); } catch {}
    await store.upsert({ ...task, localUri: result.uri, thumbnailUrl, updatedAt: Date.now() });
  }
}

async function downloadWithRetry(source: string, target: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const partial = `${target}.part`;
    try { await FileSystem.deleteAsync(partial, { idempotent: true }); const result = await FileSystem.downloadAsync(source, partial); await FileSystem.moveAsync({ from: result.uri, to: target }); return { ...result, uri: target }; }
    catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('视频下载失败');
}

TaskManager.defineTask(H3_BACKGROUND_TASK, async () => {
  try {
    await syncTasks();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});

export async function registerBackgroundSync() {
  if (!(await TaskManager.isTaskRegisteredAsync(H3_BACKGROUND_TASK))) await BackgroundTask.registerTaskAsync(H3_BACKGROUND_TASK, { minimumInterval: 15 });
}
