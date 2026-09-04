import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export async function syncTaskRun(...args: Parameters<typeof import('./sync')['syncTaskRun']>) {
  const { syncTaskRun: run } = await import('./sync');
  return run(...args);
}

export async function syncTasks() {
  const { syncTasks: run } = await import('./sync');
  return run();
}

export async function resumeTaskSyncAfterReconnect() {
  const { resumeTaskSyncAfterReconnect: resume } = await import('./sync');
  return resume();
}

export const H3_BACKGROUND_TASK = 'autodl-h3-sync';

TaskManager.defineTask(H3_BACKGROUND_TASK, async () => {
  try {
    await syncTaskRun({ reason: 'background', mode: 'maintenance' });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});

export async function registerBackgroundSync() {
  if (!(await TaskManager.isTaskRegisteredAsync(H3_BACKGROUND_TASK))) await BackgroundTask.registerTaskAsync(H3_BACKGROUND_TASK, { minimumInterval: 15 });
}
