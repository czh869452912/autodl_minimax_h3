import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { executorWakePort } from '../tasks/executorEvents';

type TerminalNotification = import('../tasks/terminalEvents').TerminalNotification;
export type TaskMonitorStatus = { running: boolean; enabled?: boolean; taskIds: string[]; sessionId?: string; cursor?: number; notificationsEnabled?: boolean; stopReason?: string };
export type StartTaskMonitorResult = { started: true; notificationsEnabled: boolean; permissionRequestFailed: boolean } | { started: false; reason: 'no-active-tasks' | 'native-unavailable' | 'start-failed' };
type NativeMonitor = {
  requestNotificationPermission?(): boolean | Promise<boolean>;
  start?(cursor: number): TaskMonitorStatus | Promise<TaskMonitorStatus>;
  stop?(): boolean | Promise<boolean>;
  stopSession?(sessionId: string): boolean | Promise<boolean>;
  getStatus?(): TaskMonitorStatus | Promise<TaskMonitorStatus>;
  publishTerminalEvents?(events: TerminalNotification[]): number | Promise<number>;
  publishSessionEvents?(sessionId: string, cursor: number, events: TerminalNotification[]): boolean | Promise<boolean>;
};
function native(): NativeMonitor | undefined { return Platform.OS === 'android' ? NativeModules.AutoDLTaskMonitor as NativeMonitor | undefined : undefined; }

export async function runTaskMonitorTick() {
  const { executorRunner } = require('../tasks/executorRuntime') as typeof import('../tasks/executorRuntime');
  return executorRunner.runSlice({ trigger: 'service' });
}

export async function startTaskMonitor(taskIds: string[]): Promise<StartTaskMonitorResult> {
  const module = native();
  if (!taskIds.some(id => id.trim())) return { started: false, reason: 'no-active-tasks' };
  if (!module?.start || !module.getStatus) return { started: false, reason: 'native-unavailable' };
  let permissionRequestFailed = false;
  try {
    try { await module.requestNotificationPermission?.(); } catch { permissionRequestFailed = true; }
    const { getMonitorQueue } = require('../tasks/executorRuntime') as typeof import('../tasks/executorRuntime');
    const cursor = await (await getMonitorQueue()).cursor();
    const status = await module.start(cursor);
    if (!status.running) return { started: false, reason: 'start-failed' };
    executorWakePort.signal('service');
    return { started: true, notificationsEnabled: status.notificationsEnabled !== false, permissionRequestFailed };
  } catch { return { started: false, reason: 'start-failed' }; }
}

export async function publishTerminalEvents(events: TerminalNotification[]): Promise<number> {
  return events.length ? Number(await native()?.publishTerminalEvents?.(events)) || 0 : 0;
}

const ticks = new Map<string, Promise<void>>();
export function runTaskMonitorHeadless(sessionId: string): Promise<void> {
  if (!sessionId) return Promise.resolve();
  const existing = ticks.get(sessionId);
  if (existing) return existing;
  const work = (async () => {
    const module = native();
    const status = await getTaskMonitorStatus();
    if (!status.running || status.sessionId !== sessionId || !module?.publishSessionEvents || !module.stopSession) return;
    const { getMonitorQueue } = require('../tasks/executorRuntime') as typeof import('../tasks/executorRuntime');
    const queue = await getMonitorQueue();
    const result = await runTaskMonitorTick();
    let cursor = status.cursor ?? 0;
    // Bound notification draining; the next tick resumes from the durable cursor.
    for (let page = 0; page < 4; page++) {
      const batch = await queue.read(cursor);
      if (batch.cursor > cursor && !await module.publishSessionEvents(sessionId, batch.cursor, batch.events)) return;
      cursor = batch.cursor;
      if (!batch.hasMore) {
        if (!result.budgetExhausted && result.nextWakeAt == null) await queue.stopIfIdle(cursor, async () => Boolean(await module.stopSession!(sessionId)));
        return;
      }
    }
  })().catch(() => {
    // Maintenance, busy databases and notification failures leave durable work /
    // cursors intact. End this tick; the service's next tick retries from storage.
    // Do not publish error text or stop the session on a transient headless failure.
  }).finally(() => ticks.delete(sessionId));
  ticks.set(sessionId, work);
  return work;
}

export async function stopTaskMonitor(): Promise<boolean> { return Boolean(await native()?.stop?.()); }
export async function getTaskMonitorStatus(): Promise<TaskMonitorStatus> {
  const value = await native()?.getStatus?.();
  return { ...value, running: Boolean(value?.running), taskIds: Array.isArray(value?.taskIds) ? value.taskIds.map(String) : [] };
}
export function subscribeTaskMonitorStatus(listener: (status: TaskMonitorStatus) => void): () => void {
  const subscription = DeviceEventEmitter.addListener('AutoDLTaskMonitorStatus', listener);
  return () => subscription.remove();
}
