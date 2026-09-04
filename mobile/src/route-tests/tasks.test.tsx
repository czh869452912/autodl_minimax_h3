import React from 'react';
import { act, create } from 'react-test-renderer';
import { FlatList, Text } from 'react-native';

const mockFocusCallbacks: Array<() => void> = [];
const mockRequestDownload = jest.fn(async (_taskId: string) => ({ status: 'queued' as const }));
const mockRequestExport = jest.fn(async (_taskId: string, _policy: { keepPrivateCopy: boolean }) => ({ status: 'queued' as const }));
const mockStartMonitor = jest.fn(async (_taskIds: string[]) => ({ started: true } as const));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const ReactModule = require('react');
    ReactModule.useEffect(() => {
      effect();
      mockFocusCallbacks.push(effect);
      return () => {
        const index = mockFocusCallbacks.indexOf(effect);
        if (index >= 0) mockFocusCallbacks.splice(index, 1);
      };
    }, [effect]);
  },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../tasks/sync', () => {
  const tasks = [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }];
  const syncTasks = jest.fn(async () => tasks);
  return {
    taskStore: { list: jest.fn(async () => tasks), remove: jest.fn(async () => undefined) },
    mediaStore: {},
    syncTasks,
    syncTaskRun: jest.fn(async () => ({
      tasks: await syncTasks(),
      summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } },
    })),
    requestTaskDownload: (taskId: string) => mockRequestDownload(taskId),
    requestTaskExport: (taskId: string, policy: { keepPrivateCopy: boolean }) => mockRequestExport(taskId, policy),
  };
});
jest.mock('../settings/storage', () => ({ readSettings: jest.fn(async () => ({ keepPrivateCopy: false })) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('../native/taskMonitor', () => ({
  getTaskMonitorStatus: jest.fn(async () => ({ running: false, taskIds: [] })),
  startTaskMonitor: (taskIds: string[]) => mockStartMonitor(taskIds),
  stopTaskMonitor: jest.fn(async () => true),
}));

import TasksScreen from '../../app/(tabs)/tasks';
import { syncTaskRun, syncTasks, taskStore } from '../tasks/sync';

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockFocusCallbacks.splice(0, mockFocusCallbacks.length);
  jest.mocked(syncTaskRun).mockReset().mockImplementation(async () => ({
    tasks: await syncTasks(),
    summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } },
  }) as never);
});

test('refreshes visible running duration every second while task is in progress', async () => {
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(2_000);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const texts = () => renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(texts()).toContain('执行 0分00秒');
  expect(renderer!.root.findByType(FlatList).props.extraData).toBeUndefined();
  jest.spyOn(Date, 'now').mockReturnValue(62_000);
  await act(async () => { jest.advanceTimersByTime(1_000); });
  expect(texts()).toContain('执行 1分00秒');
  act(() => { renderer!.unmount(); });
});

test('refresh button exposes busy state and a completion timestamp', async () => {
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(2_000);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const refresh = renderer!.root.findByProps({ accessibilityLabel: '刷新任务' });
  expect(refresh.props.accessibilityState).toMatchObject({ busy: false });
  let finishRefresh: ((tasks: unknown[]) => void) | undefined;
  jest.mocked(syncTasks).mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve; }) as never);
  act(() => { refresh.props.onPress(); });
  expect(renderer!.root.findByProps({ accessibilityLabel: '刷新任务' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  await act(async () => { finishRefresh?.([{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]); });
  const texts = renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(texts.some((text) => /^已更新 \d{2}:\d{2}:\d{2}$/.test(text))).toBe(true);
  act(() => { renderer!.unmount(); });
});

test('offers gallery retry without calling a successful download failed', async () => {
  const failedExport = { id: 'task-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' as const, exportState: 'EXPORT_FAILED' as const, exportError: '空间不足', createdAt: 1_000, updatedAt: 2_000 };
  jest.mocked(taskStore.list).mockResolvedValueOnce([failedExport]);
  jest.mocked(syncTasks).mockResolvedValueOnce([failedExport]);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  expect(renderer!.root.findByProps({ accessibilityLabel: '重试保存到系统相册' })).toBeTruthy();
  const texts = renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(texts).toContain('保存到相册失败');
  expect(texts).not.toContain('下载失败');
  act(() => { renderer!.unmount(); });
});

test('persists an explicit download retry through the command facade and reloads projections', async () => {
  const failedDownload = { id: 'task-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, adapterId: 'autodl-comfyui', videoUrl: 'https://autodl.art/result.mp4', downloadState: 'DOWNLOAD_FAILED' as const, downloadError: 'network', createdAt: 1_000, updatedAt: 2_000 };
  jest.mocked(taskStore.list).mockResolvedValueOnce([failedDownload]);
  jest.mocked(syncTasks).mockResolvedValueOnce([failedDownload]);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const syncCallsBefore = jest.mocked(syncTaskRun).mock.calls.length;

  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '重试下载' }).props.onPress());

  expect(mockRequestDownload).toHaveBeenCalledWith('task-1');
  expect(jest.mocked(syncTaskRun).mock.calls.length).toBeGreaterThan(syncCallsBefore);
  act(() => renderer!.unmount());
});

test('persists a gallery retry with the current private-copy policy and reloads projections', async () => {
  const failedExport = { id: 'task-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, adapterId: 'autodl-comfyui', videoUrl: 'https://autodl.art/result.mp4', downloadState: 'DOWNLOADED' as const, exportState: 'EXPORT_FAILED' as const, exportError: '空间不足', createdAt: 1_000, updatedAt: 2_000 };
  jest.mocked(taskStore.list).mockResolvedValueOnce([failedExport]);
  jest.mocked(syncTasks).mockResolvedValueOnce([failedExport]);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });

  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '重试保存到系统相册' }).props.onPress());

  expect(mockRequestExport).toHaveBeenCalledWith('task-1', { keepPrivateCopy: false });
  act(() => renderer!.unmount());
});

test('does not poll again when the visible task set is terminal', async () => {
  jest.useFakeTimers();
  jest.mocked(syncTasks).mockResolvedValue([{ id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5, createdAt: 1_000, updatedAt: 2_000 }]);
  await act(async () => { create(<TasksScreen />); });
  const callsAfterLoad = jest.mocked(syncTasks).mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(jest.mocked(syncTasks).mock.calls.length).toBe(callsAfterLoad);
});

test('continues polling active provider tasks across unchanged summaries', async () => {
  jest.useFakeTimers();
  const pendingResult = {
    tasks: [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 2 }],
    summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } },
  } as never;
  jest.mocked(syncTaskRun).mockResolvedValue(pendingResult);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const calls = jest.mocked(syncTaskRun).mock.calls.length;

  for (let poll = 0; poll < 3; poll += 1) {
    await act(async () => { jest.advanceTimersByTimeAsync(10_000); });
  }

  expect(jest.mocked(syncTaskRun)).toHaveBeenCalledTimes(calls + 3);
  act(() => { renderer!.unmount(); });
});

test('renders a terminal state reached on a later automatic poll', async () => {
  jest.useFakeTimers();
  const running = { id: 'task-1', prompt: 'x', status: 'RUNNING' as const, resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 2 };
  const succeeded = { ...running, status: 'SUCCESS' as const, downloadState: 'DOWNLOADED' as const, exportState: 'EXPORTED' as const, galleryUri: 'content://media/video/1', updatedAt: 3 };
  const result = (tasks: Array<typeof running | typeof succeeded>) => ({
    tasks,
    summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } },
  }) as never;
  jest.mocked(syncTaskRun)
    .mockResolvedValueOnce(result([running]))
    .mockResolvedValueOnce(result([running]))
    .mockResolvedValueOnce(result([succeeded]));
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });

  await act(async () => { jest.advanceTimersByTimeAsync(10_000); });
  await act(async () => { jest.advanceTimersByTimeAsync(10_000); });

  const texts = renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(texts).toContain('成功');
  expect(texts).toContain('已保存到相册');
  act(() => { renderer!.unmount(); });
});

test('waits for the exact scheduled retry instead of polling every ten seconds', async () => {
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(1_000);
  const scheduledResult = {
    tasks: [{ id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5, createdAt: 1, updatedAt: 2 }],
    summary: { nextWakeAt: 61_000, operations: { remainingDue: 0, remainingScheduled: 1, budgetExhausted: false } },
  } as never;
  jest.mocked(syncTaskRun).mockImplementationOnce(async () => scheduledResult).mockImplementationOnce(async () => scheduledResult);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const calls = jest.mocked(syncTaskRun).mock.calls.length;
  await act(async () => { jest.advanceTimersByTimeAsync(50_000); });
  expect(jest.mocked(syncTaskRun)).toHaveBeenCalledTimes(calls);
  await act(async () => { jest.advanceTimersByTimeAsync(10_000); });
  expect(jest.mocked(syncTaskRun)).toHaveBeenCalledTimes(calls + 1);
  act(() => renderer!.unmount());
});

test('refreshes when the task page receives focus after a new task is created', async () => {
  jest.useFakeTimers();
  jest.mocked(syncTasks).mockClear();
  jest.mocked(syncTasks).mockResolvedValueOnce([]);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  expect(jest.mocked(syncTasks)).toHaveBeenCalledTimes(1);
  const created = { id: 'new-task', prompt: 'new', status: 'QUEUED' as const, resolution: '768p竖', duration: 5, createdAt: 3_000, updatedAt: 3_000 };
  jest.mocked(syncTasks).mockResolvedValueOnce([created]);
  await act(async () => { mockFocusCallbacks[0]?.(); });
  expect(jest.mocked(syncTasks)).toHaveBeenCalledTimes(2);
  expect(renderer!.root.findAllByType(Text).some((node) => node.props.children === 'new')).toBe(true);
  act(() => renderer!.unmount());
});

test.each([
  ['permission-denied', '需要通知权限', '请允许通知权限后再开启持续监控。'],
  ['native-unavailable', '暂不支持持续监控', '当前设备不支持后台任务通知。'],
  ['start-failed', '开启失败', '持续监控启动失败，请稍后重试。'],
] as const)('shows a specific monitor error for %s', async (reason, title, body) => {
  const { Alert } = require('react-native');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockStartMonitor.mockResolvedValueOnce({ started: false, reason } as never);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '开启持续监控' }).props.onPress());
  expect(Alert.alert).toHaveBeenCalledWith(title, body);
  act(() => renderer!.unmount());
});

test('explains that continuous monitoring needs an active task', async () => {
  const { Alert } = require('react-native');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockStartMonitor.mockResolvedValueOnce({ started: false, reason: 'no-active-tasks' } as never);
  jest.mocked(taskStore.list).mockResolvedValueOnce([]);
  jest.mocked(syncTasks).mockResolvedValueOnce([]);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });

  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '开启持续监控' }).props.onPress());

  expect(Alert.alert).toHaveBeenCalledWith('没有可监控任务', '当前没有排队中或运行中的任务。');
  act(() => renderer!.unmount());
});
