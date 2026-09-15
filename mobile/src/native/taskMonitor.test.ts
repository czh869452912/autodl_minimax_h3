import { NativeModules, Platform } from 'react-native';
import { getTaskMonitorStatus, runTaskMonitorHeadless, startTaskMonitor, stopTaskMonitor } from './taskMonitor';
const mockQueue = { cursor: jest.fn(async () => 12), read: jest.fn(async (_cursor: number) => ({ cursor: 13, events: [{ eventId: 'B', taskId: 'B' }], hasMore: false })), stopIfIdle: jest.fn(async (_cursor: number, stop: () => Promise<boolean>) => stop()) };
const mockRun = jest.fn<Promise<{ budgetExhausted?: boolean; nextWakeAt?: number }>, unknown[]>(async () => ({}));
const mockGetQueue = jest.fn(async () => mockQueue);
jest.mock('../tasks/executorRuntime', () => ({ executorRunner: { runSlice: (...args: unknown[]) => (mockRun as any)(...args) }, getMonitorQueue: () => mockGetQueue() }));
const status = { running: true, sessionId: 's1', cursor: 12, taskIds: [], notificationsEnabled: false };
let module: any;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  module = { getStatus: jest.fn(async () => status), start: jest.fn(async () => status), stop: jest.fn(async () => true), requestNotificationPermission: jest.fn(async () => false), publishSessionEvents: jest.fn(async () => true), stopSession: jest.fn(async () => true) };
  (NativeModules as any).AutoDLTaskMonitor = module;
});
test('permission denial permits monitoring, reports disabled notifications, and starts at a durable cursor', async () => {
  await expect(startTaskMonitor(['A'])).resolves.toEqual({ started: true, notificationsEnabled: false, permissionRequestFailed: false });
  expect(module.start).toHaveBeenCalledWith(12);
  expect(mockRun).not.toHaveBeenCalled();
  await stopTaskMonitor();
  expect(module.stop).toHaveBeenCalled();
});
test('permission request exceptions do not masquerade as start failures', async () => {
  module.requestNotificationPermission.mockRejectedValueOnce(new Error('activity missing'));
  await expect(startTaskMonitor(['A'])).resolves.toMatchObject({ started: true, permissionRequestFailed: true });
  module.start.mockRejectedValueOnce(new Error('native start failed'));
  await expect(startTaskMonitor(['A'])).resolves.toEqual({ started: false, reason: 'start-failed' });
  // Native owns cleanup of its failed session; a JS catch must not stop a newer one.
  expect(module.stop).not.toHaveBeenCalled();
});
test('empty tasks and unsupported platforms do not start', async () => {
  await expect(startTaskMonitor([])).resolves.toMatchObject({ started: false, reason: 'no-active-tasks' });
  expect(module.start).not.toHaveBeenCalled();
  jest.replaceProperty(Platform, 'OS', 'ios');
  await expect(startTaskMonitor(['A'])).resolves.toMatchObject({ reason: 'native-unavailable' });
  await expect(getTaskMonitorStatus()).resolves.toEqual({ running: false, taskIds: [] });
});
test('headless execution is global, publishes new-task events, and only stops its own session', async () => {
  const first = runTaskMonitorHeadless('s1');
  expect(runTaskMonitorHeadless('s1')).toBe(first);
  await first;
  expect(mockRun).toHaveBeenCalledWith({ trigger: 'service' });
  expect(module.publishSessionEvents).toHaveBeenCalledWith('s1', 13, [expect.objectContaining({ taskId: 'B' })]);
  expect(module.stopSession).toHaveBeenCalledWith('s1');
  expect(module.stop).not.toHaveBeenCalled();
});
test('stale or stopped headless sessions cannot execute, publish, or stop a newer session', async () => {
  await runTaskMonitorHeadless('old');
  expect(mockRun).not.toHaveBeenCalled();
  module.getStatus.mockResolvedValueOnce({ ...status, running: false });
  await runTaskMonitorHeadless('s1');
  expect(mockRun).not.toHaveBeenCalled();
  module.publishSessionEvents.mockResolvedValueOnce(false);
  await runTaskMonitorHeadless('s1');
  expect(module.stopSession).not.toHaveBeenCalled();
});

test.each([{ budgetExhausted: true }, { nextWakeAt: 123 }])('headless preserves the next slice for budget or lease contention: %j', async result => {
  mockRun.mockResolvedValueOnce(result);
  await runTaskMonitorHeadless('s1');
  expect(module.stopSession).not.toHaveBeenCalled();
});

test.each(['admission', 'slice', 'read', 'publish', 'stop'] as const)('headless catches %s failures and allows a later tick to resume', async stage => {
  const error = new Error(stage === 'admission' ? 'DATABASE_MAINTENANCE_PENDING' : 'SQLITE_BUSY');
  if (stage === 'admission') mockGetQueue.mockRejectedValueOnce(error);
  if (stage === 'slice') mockRun.mockRejectedValueOnce(error);
  if (stage === 'read') mockQueue.read.mockRejectedValueOnce(error);
  if (stage === 'publish') module.publishSessionEvents.mockRejectedValueOnce(error);
  if (stage === 'stop') mockQueue.stopIfIdle.mockRejectedValueOnce(error);
  await expect(runTaskMonitorHeadless('s1')).resolves.toBeUndefined();
  expect(module.stopSession).not.toHaveBeenCalled();
  expect(module.stop).not.toHaveBeenCalled();
  jest.clearAllMocks();
  await expect(runTaskMonitorHeadless('s1')).resolves.toBeUndefined();
  expect(mockQueue.read).toHaveBeenCalledWith(12);
  expect(module.stopSession).toHaveBeenCalledWith('s1');
});

test('notification drain stops after four pages and the next tick uses the durable cursor', async () => {
  for (let i = 1; i <= 4; i++) mockQueue.read.mockResolvedValueOnce({ cursor: 12 + i * 64, events: [], hasMore: true });
  await runTaskMonitorHeadless('s1');
  expect(mockQueue.read).toHaveBeenCalledTimes(4);
  expect(module.publishSessionEvents).toHaveBeenLastCalledWith('s1', 268, []);
  expect(module.stopSession).not.toHaveBeenCalled();
  module.getStatus.mockResolvedValueOnce({ ...status, cursor: 268 });
  mockQueue.read.mockResolvedValueOnce({ cursor: 269, events: [], hasMore: false });
  await runTaskMonitorHeadless('s1');
  expect(mockQueue.read).toHaveBeenLastCalledWith(268);
  expect(module.stopSession).toHaveBeenCalledWith('s1');
});
