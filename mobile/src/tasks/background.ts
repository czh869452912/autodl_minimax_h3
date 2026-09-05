import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
export async function resumeTaskSyncAfterReconnect() {
  const { resumeConnectivityWork } = await import('./connectivityCommands');
  return resumeConnectivityWork();
}
export const H3_BACKGROUND_TASK = 'autodl-h3-sync';
TaskManager.defineTask(H3_BACKGROUND_TASK, async () => {
  try {
    const { executorRunner } = await import('./executorRuntime');
    const result = await executorRunner.runSlice({ trigger: 'background' });
    if (result.remainingDue + result.remainingScheduled > 0 || result.nextWakeAt != null) await registerBackgroundSync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});
export async function registerBackgroundSync() {
  if (!(await TaskManager.isTaskRegisteredAsync(H3_BACKGROUND_TASK))) await BackgroundTask.registerTaskAsync(H3_BACKGROUND_TASK, { minimumInterval: 15 });
}
