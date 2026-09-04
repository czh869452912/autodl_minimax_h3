import { NativeModules, Platform } from 'react-native';
import { getTaskMonitorStatus, publishTerminalEvents, runTaskMonitorHeadless, startTaskMonitor, stopTaskMonitor } from './taskMonitor';

jest.mock('../tasks/background', () => ({ syncTaskRun: jest.fn(async () => undefined) }));

test('starts and stops the Android continuous task monitor', async () => {
  const order: string[] = [];
  (require('../tasks/background').syncTaskRun as jest.Mock).mockImplementationOnce(async () => {
    order.push('tick');
    return { summary: { remaining: 1, terminalEvents: [] } };
  });
  const native = { requestNotificationPermission: jest.fn(async () => { order.push('permission'); return true; }), start: jest.fn(() => { order.push('start'); }), stop: jest.fn(), getStatus: jest.fn().mockResolvedValue({ running: true, taskIds: ['t1'] }) };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  await expect(startTaskMonitor(['t1'])).resolves.toEqual({ started: true });
  expect(native.start).toHaveBeenCalledWith(['t1']);
  expect(require('../tasks/background').syncTaskRun).toHaveBeenCalledWith({ reason: 'service', mode: 'service', taskIds: ['t1'] });
  expect(order).toEqual(['permission', 'start', 'tick']);
  expect(await getTaskMonitorStatus()).toMatchObject({ running: true });
  await stopTaskMonitor();
  expect(native.stop).toHaveBeenCalled();
});

test('is a no-op on unsupported platforms', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await expect(startTaskMonitor(['t1'])).resolves.toEqual({ started: false, reason: 'native-unavailable' });
  await expect(getTaskMonitorStatus()).resolves.toEqual({ running: false, taskIds: [] });
});

test('stops a monitor whose initial service tick fails', async () => {
  const native = {
    requestNotificationPermission: jest.fn(async () => true),
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  (require('../tasks/background').syncTaskRun as jest.Mock).mockRejectedValueOnce(new Error('offline'));

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
  const sync = require('../tasks/background').syncTaskRun as jest.Mock;
  sync.mockResolvedValueOnce({ summary: { remaining: 0, terminalEvents: [{ eventId: 'e1', taskId: 't1', status: 'SUCCESS', title: '任务已完成', body: '视频生成任务已成功完成' }] } });
  await expect(runTaskMonitorHeadless(['t1'])).resolves.toMatchObject({ remaining: 0 });
  expect(order).toEqual(['publish', 'stop']);
  expect(native.publishTerminalEvents).toHaveBeenCalledWith([expect.objectContaining({ eventId: 'e1' })]);
  await expect(publishTerminalEvents([])).resolves.toBe(0);
});
