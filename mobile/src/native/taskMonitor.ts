import { NativeModules, Platform } from 'react-native';

export type TaskMonitorStatus = { running: boolean; taskIds: string[] };
type NativeMonitor = { start?(taskIds: string[]): void | Promise<void>; stop?(): void | Promise<void>; getStatus?(): TaskMonitorStatus | Promise<TaskMonitorStatus> };

function native(): NativeMonitor | undefined { return Platform.OS === 'android' ? (NativeModules.AutoDLTaskMonitor as NativeMonitor | undefined) : undefined; }

export async function runTaskMonitorTick(taskIds: string[]): Promise<void> {
  const { syncTaskRun } = require('../tasks/background') as typeof import('../tasks/background');
  await syncTaskRun('service', taskIds);
}

export async function startTaskMonitor(taskIds: string[]): Promise<boolean> {
  const module = native();
  const ids = taskIds.map((id) => id.trim()).filter(Boolean);
  if (!module?.start || ids.length === 0) return false;
  await module.start(ids);
  await runTaskMonitorTick(ids);
  return true;
}

export async function stopTaskMonitor(): Promise<boolean> {
  const module = native();
  if (!module?.stop) return false;
  await module.stop();
  return true;
}

export async function getTaskMonitorStatus(): Promise<TaskMonitorStatus> {
  const module = native();
  if (!module?.getStatus) return { running: false, taskIds: [] };
  const value = await module.getStatus();
  return { running: Boolean(value?.running), taskIds: Array.isArray(value?.taskIds) ? value.taskIds.map(String) : [] };
}
