import React from 'react';
import { act, create } from 'react-test-renderer';
import { FlatList, Text } from 'react-native';

jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../../src/tasks/sync', () => ({
  taskStore: { list: jest.fn(async () => [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]) },
  syncTasks: jest.fn(async () => [{ id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5, createdAt: 1_000, startedAt: 1_500, updatedAt: 2_000 }]),
}));
jest.mock('../../src/tasks/download', () => ({ downloadTask: jest.fn() }));
jest.mock('../../src/ui/icons', () => ({ AppIcon: () => null }));

import TasksScreen from './tasks';
import { syncTasks } from '../../src/tasks/sync';

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
