import React from 'react';
import { act, create } from 'react-test-renderer';
import { FlatList, Text } from 'react-native';

const mockFocusCallbacks: Array<() => void> = [];
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
jest.mock('../tasks/sync', () => ({
  taskStore: { list: jest.fn(async () => [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]) },
  syncTasks: jest.fn(async () => [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]),
}));
jest.mock('../tasks/download', () => ({ downloadTask: jest.fn() }));
jest.mock('../tasks/media', () => ({ exportTaskVideo: jest.fn(async (task) => ({ ...task, exportState: 'EXPORTED', galleryUri: 'content://media/video/7' })) }));
jest.mock('../workflows/providers/registry', () => ({
  getBuiltinArtifactDownloadPolicy: jest.fn(() => ({
    allowedHosts: ['autodl.art'], acceptedMimes: ['video/mp4'],
    maxBytes: 2 * 1024 * 1024 * 1024, timeoutMs: 30_000,
  })),
}));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import TasksScreen from '../../app/(tabs)/tasks';
import { syncTasks, taskStore } from '../tasks/sync';
import { downloadTask } from '../tasks/download';
import { exportTaskVideo } from '../tasks/media';

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockFocusCallbacks.splice(0, mockFocusCallbacks.length);
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

test('passes the adapter artifact policy to an explicit download retry', async () => {
  const failedDownload = { id: 'task-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, adapterId: 'autodl-comfyui', videoUrl: 'https://autodl.art/result.mp4', downloadState: 'DOWNLOAD_FAILED' as const, downloadError: 'network', createdAt: 1_000, updatedAt: 2_000 };
  jest.mocked(taskStore.list).mockResolvedValueOnce([failedDownload]);
  jest.mocked(syncTasks).mockResolvedValueOnce([failedDownload]);
  jest.mocked(downloadTask).mockResolvedValueOnce({ ...failedDownload, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED' });
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });

  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '重试下载' }).props.onPress());

  expect(downloadTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }), expect.objectContaining({
    allowedHosts: ['autodl.art'], acceptedMimes: ['video/mp4'],
    maxBytes: 2 * 1024 * 1024 * 1024, timeoutMs: 30_000,
  }));
  act(() => renderer!.unmount());
});

test('passes the adapter artifact policy to an explicit gallery retry', async () => {
  const failedExport = { id: 'task-1', prompt: 'x', status: 'SUCCESS' as const, resolution: '768p竖', duration: 5, adapterId: 'autodl-comfyui', videoUrl: 'https://autodl.art/result.mp4', downloadState: 'DOWNLOADED' as const, exportState: 'EXPORT_FAILED' as const, exportError: '空间不足', createdAt: 1_000, updatedAt: 2_000 };
  jest.mocked(taskStore.list).mockResolvedValueOnce([failedExport]);
  jest.mocked(syncTasks).mockResolvedValueOnce([failedExport]);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });

  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '重试保存到系统相册' }).props.onPress());

  expect(exportTaskVideo).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }), expect.objectContaining({
    allowedHosts: ['autodl.art'], acceptedMimes: ['video/mp4'],
    maxBytes: 2 * 1024 * 1024 * 1024, timeoutMs: 30_000,
  }));
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
