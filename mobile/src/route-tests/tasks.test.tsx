import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, FlatList, Text } from 'react-native';
const mockCard = { id: 'task-1', prompt: 'hello', status: 'SUCCESS', resolution: '720p', duration: 5, downloadState: 'DOWNLOAD_FAILED', exportState: 'NOT_REQUESTED', createdAt: 1000, updatedAt: 1000 };
const mockActivity = { activeTaskCount: 0, remainingDue: 0, remainingScheduled: 0, claimedOperationCount: 0, pendingOperationCount: 0 };
const mockRead = jest.fn(async () => ({ revision: 1, items: [mockCard], activity: mockActivity, nextCursor: { id: 'task-1', createdAt: 1000 } }));
const mockRefresh = jest.fn(async () => ({ status: 'accepted' }));
const mockDownload = jest.fn(async () => ({ status: 'accepted' }));
const mockExport = jest.fn(async () => ({ status: 'accepted' }));
const mockMonitor = jest.fn(async (_ids: string[]) => ({ started: true }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); },
}));
jest.mock('../tasks/taskServices', () => ({
  taskProjectionRepository: { readConsistentWindow: (...args: unknown[]) => (mockRead as any)(...args), readRevision: async () => 1, readActivity: async () => mockActivity },
  taskCommandService: { requestRefresh: () => mockRefresh(), requestDownload: () => mockDownload(), requestExport: (...args: unknown[]) => (mockExport as any)(...args) },
  taskStore: { remove: async () => undefined }, listActiveTaskIds: async () => ['off-page-task'],
}));
jest.mock('../settings/storage', () => ({ readSettings: async () => ({ keepPrivateCopy: false }) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('../native/taskMonitor', () => ({ getTaskMonitorStatus: async () => ({ running: false }), startTaskMonitor: (ids: string[]) => mockMonitor(ids), stopTaskMonitor: async () => true }));
import TasksScreen from '../../app/(tabs)/tasks';
import { executorEvents } from '../tasks/executorEvents';
import { taskProjectionEvents } from '../tasks/taskProjectionEvents';
let tree: ReturnType<typeof create>;
const texts = () => tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); jest.clearAllMocks(); executorEvents.publish({ phase: 'idle' }); });

test('first projection and manual refresh finish while worker and maintenance remain unresolved', async () => {
  executorEvents.publish({ phase: 'running' });
  mockRefresh.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => { tree = create(<TasksScreen />); });
  expect(texts()).toContain('hello');
  expect(texts()).toContain('后台处理中…');
  let release!: (value: any) => void;
  mockRead.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  act(() => tree.root.findByProps({ accessibilityLabel: '刷新任务' }).props.onPress());
  expect(tree.root.findByType(FlatList).props.refreshing).toBe(true);
  await act(async () => { release({ revision: 1, items: [mockCard], activity: mockActivity }); });
  expect(tree.root.findByType(FlatList).props.refreshing).toBe(false);
  expect(tree.root.findByProps({ accessibilityLabel: '查看任务详情' }).props.disabled).toBeFalsy();
});

test('download and export acknowledge persistence, monitoring uses off-page activity, pagination reads larger window', async () => {
  await act(async () => { tree = create(<TasksScreen />); });
  await act(async () => tree.root.findByProps({ accessibilityLabel: '重试下载' }).props.onPress());
  expect(mockDownload).toHaveBeenCalledTimes(1);
  await act(async () => tree.root.findByProps({ accessibilityLabel: '开启持续监控' }).props.onPress());
  expect(mockMonitor).toHaveBeenCalledWith(['off-page-task']);
  await act(async () => tree.root.findByType(FlatList).props.onEndReached());
  expect(mockRead).toHaveBeenLastCalledWith(80);
});

test('automatic failure retains cards with a nonmodal stale indicator; manual failure alerts once', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await act(async () => { tree = create(<TasksScreen />); });
  mockRead.mockRejectedValueOnce(new Error('offline'));
  await act(async () => tree.root.findByProps({ accessibilityLabel: '刷新任务' }).props.onPress());
  expect(texts()).toContain('hello');
  expect(texts()).toContain('状态可能已过期：offline');
  expect(alert).toHaveBeenCalledTimes(1);
});
