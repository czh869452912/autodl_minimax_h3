import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { syncTaskRun } from './sync';

export { syncTasks, syncTaskRun } from './sync';

export const H3_BACKGROUND_TASK = 'autodl-h3-sync';

TaskManager.defineTask(H3_BACKGROUND_TASK, async () => {
  try {
    await syncTaskRun('background');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});

export async function registerBackgroundSync() {
  if (!(await TaskManager.isTaskRegisteredAsync(H3_BACKGROUND_TASK))) await BackgroundTask.registerTaskAsync(H3_BACKGROUND_TASK, { minimumInterval: 15 });
}
