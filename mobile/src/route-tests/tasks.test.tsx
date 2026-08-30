import React from 'react';
import { act, create } from 'react-test-renderer';
import { FlatList, Text } from 'react-native';

jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../tasks/sync', () => ({
  taskStore: { list: jest.fn(async () => [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]) },
  syncTasks: jest.fn(async () => [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]),
}));
jest.mock('../tasks/download', () => ({ downloadTask: jest.fn() }));
jest.mock('../tasks/media', () => ({ exportTaskVideo: jest.fn(async (task) => ({ ...task, exportState: 'EXPORTED', galleryUri: 'content://media/video/7' })) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import TasksScreen from '../../app/(tabs)/tasks';
import { syncTasks, taskStore } from '../tasks/sync';

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('refreshes visible running duration every second while task is in progress', async () => {
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(2_000);
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TasksScreen />); });
  const texts = () => renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
  expect(texts()).toContain('执行 0分00秒');
  expect(renderer!.root.findByType(FlatList).props.extraData).toBe(2_000);
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
