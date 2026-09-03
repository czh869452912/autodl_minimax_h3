import { NativeModules, Platform } from 'react-native';
import { getTaskMonitorStatus, startTaskMonitor, stopTaskMonitor } from './taskMonitor';

jest.mock('../tasks/background', () => ({ syncTaskRun: jest.fn(async () => undefined) }));

test('starts and stops the Android continuous task monitor', async () => {
  const native = { start: jest.fn(), stop: jest.fn(), getStatus: jest.fn().mockResolvedValue({ running: true, taskIds: ['t1'] }) };
  (NativeModules as any).AutoDLTaskMonitor = native;
  jest.replaceProperty(Platform, 'OS', 'android');
  await startTaskMonitor(['t1']);
  expect(native.start).toHaveBeenCalledWith(['t1']);
  expect(require('../tasks/background').syncTaskRun).toHaveBeenCalledWith('service', ['t1']);
  expect(await getTaskMonitorStatus()).toMatchObject({ running: true });
  await stopTaskMonitor();
  expect(native.stop).toHaveBeenCalled();
});

test('is a no-op on unsupported platforms', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await expect(startTaskMonitor(['t1'])).resolves.toBe(false);
  await expect(getTaskMonitorStatus()).resolves.toEqual({ running: false, taskIds: [] });
});
