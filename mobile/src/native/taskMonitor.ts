import { NativeModules, Platform } from 'react-native';

export type TaskMonitorStatus = { running: boolean; taskIds: string[] };
export type StartTaskMonitorResult = { started: true } | { started: false; reason: 'permission-denied' | 'no-active-tasks' | 'native-unavailable' | 'start-failed' };
type TerminalNotification = import('../tasks/terminalEvents').TerminalNotification;
type NativeMonitor = {
  requestNotificationPermission?(): boolean | Promise<boolean>;
  start?(taskIds: string[]): void | Promise<void>;
  stop?(): void | Promise<void>;
  getStatus?(): TaskMonitorStatus | Promise<TaskMonitorStatus>;
  publishTerminalEvents?(events: TerminalNotification[]): number | Promise<number>;
};

function native(): NativeMonitor | undefined { return Platform.OS === 'android' ? (NativeModules.AutoDLTaskMonitor as NativeMonitor | undefined) : undefined; }

export async function runTaskMonitorTick(taskIds: string[]) {
  const { syncTaskRun } = require('../tasks/background') as typeof import('../tasks/background');
  return syncTaskRun({ reason: 'service', mode: 'service', taskIds });
}

export async function startTaskMonitor(taskIds: string[]): Promise<StartTaskMonitorResult> {
  const module = native();
  const ids = [...new Set(taskIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { started: false, reason: 'no-active-tasks' };
  if (!module?.start || !module.requestNotificationPermission) return { started: false, reason: 'native-unavailable' };
  let startAttempted = false;
  try {
    if (!await module.requestNotificationPermission()) return { started: false, reason: 'permission-denied' };
    startAttempted = true;
    await module.start(ids);
    await runTaskMonitorTick(ids);
    return { started: true };
  } catch {
    if (startAttempted) {
      try { await module.stop?.(); } catch { /* preserve the original start failure */ }
    }
    return { started: false, reason: 'start-failed' };
  }
}

export async function publishTerminalEvents(events: TerminalNotification[]): Promise<number> {
  if (events.length === 0) return 0;
  const module = native();
  if (!module?.publishTerminalEvents) return 0;
  return Number(await module.publishTerminalEvents(events)) || 0;
}

export async function runTaskMonitorHeadless(taskIds: string[]) {
  const result = await runTaskMonitorTick(taskIds);
  await publishTerminalEvents(result.summary.terminalEvents);
  if (result.summary.remaining === 0) await stopTaskMonitor();
  return result.summary;
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
