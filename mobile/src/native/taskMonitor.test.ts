import { NativeModules, Platform } from 'react-native';
import { getTaskMonitorStatus, publishTerminalEvents, runTaskMonitorHeadless, startTaskMonitor, stopTaskMonitor } from './taskMonitor';

jest.mock('../tasks/executorRuntime', () => ({ executorRunner: { runSlice: jest.fn(async () => ({ remainingDue: 1, remainingScheduled: 0 })) }, readTerminalNotifications: jest.fn(() => [{ eventId: 'e1', taskId: 't1' }]) }));

test('starts and stops the Android continuous task monitor', async () => {
  const order: string[] = [];
  const native = { requestNotificationPermission: jest.fn(async () => { order.push('permission'); return true; }), start: jest.fn(() => { order.push('start'); }), stop: jest.fn(), getStatus: jest.fn().mockResolvedValue({ running: true, taskIds: ['t1'] }) };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  await expect(startTaskMonitor(['t1'])).resolves.toEqual({ started: true });
  expect(native.start).toHaveBeenCalledWith(['t1']);
  expect(require('../tasks/executorRuntime').executorRunner.runSlice).not.toHaveBeenCalled();
  expect(order).toEqual(['permission', 'start']);
  expect(await getTaskMonitorStatus()).toMatchObject({ running: true });
  await stopTaskMonitor();
  expect(native.stop).toHaveBeenCalled();
});

test('is a no-op on unsupported platforms', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await expect(startTaskMonitor(['t1'])).resolves.toEqual({ started: false, reason: 'native-unavailable' });
  await expect(getTaskMonitorStatus()).resolves.toEqual({ running: false, taskIds: [] });
});

test('stops a monitor whose native start fails', async () => {
  const native = {
    requestNotificationPermission: jest.fn(async () => true),
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  native.start.mockRejectedValueOnce(new Error('native failure'));

  await expect(startTaskMonitor(['t1'])).resolves.toEqual({ started: false, reason: 'start-failed' });
  expect(native.stop).toHaveBeenCalledTimes(1);
});

test('does not start when permission is denied or no active tasks are supplied', async () => {
  const native = { requestNotificationPermission: jest.fn(async () => false), start: jest.fn() };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  await expect(startTaskMonitor(['t1'])).resolves.toEqual({ started: false, reason: 'permission-denied' });
  await expect(startTaskMonitor([])).resolves.toEqual({ started: false, reason: 'no-active-tasks' });
  expect(native.start).not.toHaveBeenCalled();
});

test('publishes terminal events before stopping a completed scoped monitor tick', async () => {
  const order: string[] = [];
  const native = {
    publishTerminalEvents: jest.fn(async () => { order.push('publish'); return 1; }),
    stop: jest.fn(async () => { order.push('stop'); }),
    getStatus: jest.fn(async () => ({ running: true, taskIds: ['t1'] })),
  };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  const sync = require('../tasks/executorRuntime').executorRunner.runSlice as jest.Mock;
  sync.mockResolvedValueOnce({ remainingDue: 0, remainingScheduled: 0 });
  await expect(runTaskMonitorHeadless(['t1'])).resolves.toMatchObject({ remainingDue: 0, remainingScheduled: 0 });
  expect(order).toEqual(['publish', 'stop']);
  expect(native.publishTerminalEvents).toHaveBeenCalledWith([expect.objectContaining({ eventId: 'e1' })]);
  await expect(publishTerminalEvents([])).resolves.toBe(0);
});
