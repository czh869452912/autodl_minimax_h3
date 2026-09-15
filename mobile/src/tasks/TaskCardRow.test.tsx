import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, StyleSheet, Text } from 'react-native';
import { TaskCardRow } from './TaskCardRow';
import { COLORS } from '../ui/theme';
import type { TaskCard } from './taskCard';
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

test('a failed derivative keeps the original downloaded without offering retired conversion', () => {
  const item: TaskCard = { id: 'a', prompt: 'p', status: 'SUCCESS', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2, downloadState: 'DOWNLOADED', compatibilityState: 'FAILED', exportState: 'EXPORTED' };
  const retry = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={retry} onExport={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()} />); });
  expect(tree.root.findAllByProps({ accessibilityLabel: '重试下载' })).toHaveLength(0);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === '原件已保存到相册')).toBe(true);
  expect(tree.root.findAllByProps({ accessibilityLabel: '重试兼容转换' })).toHaveLength(0);
  expect(retry).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

test('shows an encoding explanation without offering a futile download retry', () => {
  const item: TaskCard = { id: 'a', prompt: 'p', status: 'SUCCESS', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2, downloadState: 'DOWNLOAD_FAILED', downloadError: 'ARTIFACT_MEDIA_UNSUPPORTED', exportState: 'NOT_REQUESTED' };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()} />); });
  expect(tree.root.findAllByType(Text).some(node => String(node.props.children).includes('当前设备不支持此视频编码'))).toBe(true);
  expect(tree.root.findAllByProps({ accessibilityLabel: '重试下载' })).toHaveLength(0);
  act(() => tree.unmount());
});

test('active card timing advances independently and terminal cards own no timer', () => {
  jest.useFakeTimers({ now: 2000 });
  const item: TaskCard = { id: 'a', prompt: 'p', status: 'RUNNING', resolution: '720p', duration: 5, createdAt: 1000, startedAt: 1500, updatedAt: 1500, downloadState: 'IDLE', exportState: 'NOT_REQUESTED' };
  const props = { item, busy: false, onDownload: () => {}, onExport: () => {}, onRemove: () => {}, onOpen: () => {} };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow {...props} />); });
  act(() => { jest.advanceTimersByTime(60000); });
  expect(tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''))).toContain('执行 1分00秒');
  act(() => tree.update(<TaskCardRow {...props} item={{ ...item, status: 'SUCCESS' }} />));
  expect(jest.getTimerCount()).toBe(0);
  act(() => tree.unmount());
  jest.useRealTimers();
});

test('conversion failure offers saving the untouched original', () => {
  const item: TaskCard = { id: 'a', prompt: 'p', status: 'SUCCESS', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2, downloadState: 'DOWNLOAD_FAILED', downloadError: 'ARTIFACT_COMPATIBILITY_FAILED', exportState: 'NOT_REQUESTED' };
  const onExport = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={jest.fn()} onExport={onExport} onRemove={jest.fn()} onOpen={jest.fn()} />); });
  const button = tree.root.findAllByProps({ accessibilityLabel: '保存原件到系统相册' })[0];
  expect(button).toBeDefined();
  act(() => button.props.onPress());
  expect(onExport).toHaveBeenCalledWith(item);
  act(() => tree.unmount());
});


test('shows zero download progress in Chinese and disables duplicate downloads', () => {
  const item: TaskCard = { id: 'a', prompt: 'p', status: 'SUCCESS', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2, downloadState: 'DOWNLOADING', downloadProgress: 0, exportState: 'NOT_REQUESTED' };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()} />); });
  expect(tree.root.findAllByType(Text).some(node => node.props.children === '下载中 0%')).toBe(true);
  expect(tree.root.findByProps({ accessibilityLabel: '下载进度' }).props.accessibilityValue.now).toBe(0);
  expect(tree.root.findByProps({ accessibilityLabel: '下载视频' }).props.disabled).toBe(true);
  act(() => tree.unmount());
});


test('local cancellation requires confirmation and disappears once submission starts', () => {
  const item: TaskCard = { id: 'queued', prompt: 'p', status: 'QUEUED', canCancel: true, downloadState: 'IDLE', exportState: 'NOT_REQUESTED', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2 };
  const onCancel = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const props = { item, busy: false, onCancel, onDownload: jest.fn(), onExport: jest.fn(), onRemove: jest.fn(), onOpen: jest.fn() };
  let tree!: ReturnType<typeof create>;
  try {
    act(() => { tree = create(<TaskCardRow {...props} />); });
    const cancel = () => tree.root.findAllByProps({ accessibilityLabel: '取消本地排队' })[0];
    act(() => cancel().props.onPress());
    expect(onCancel).not.toHaveBeenCalled();
    const confirm = alert.mock.calls.at(-1)![2]!.find(button => button.text === '确认取消')!;
    act(() => confirm.onPress!());
    expect(onCancel).toHaveBeenCalledWith('queued');
    act(() => tree.update(<TaskCardRow {...props} busy />));
    expect(cancel().props.disabled).toBe(true);
    act(() => tree.update(<TaskCardRow {...props} item={{ ...item, canCancel: false }} />));
    expect(cancel()).toBeUndefined();
  } finally { act(() => tree.unmount()); alert.mockRestore(); }
});


test('opens details from the visible action and separates failure status from metadata', () => {
  const item: TaskCard = { id: 'failed-download', prompt: 'A video', status: 'SUCCESS', resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2, downloadState: 'DOWNLOAD_FAILED', downloadError: '连接失败', exportState: 'NOT_REQUESTED' };
  const onOpen = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()} onOpen={onOpen} />); });
  const details = tree.root.findByProps({ accessibilityLabel: '查看任务详情' });
  expect(details.findByType(Text).props.children).toBe('查看详情 ›');
  act(() => details.props.onPress());
  expect(onOpen).toHaveBeenCalledWith(item.id);
  const texts = tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
  expect(texts).toContain('768p · 5s');
  expect(texts).toContain('下载失败');
  expect(texts).not.toContain('成功');
  act(() => tree.unmount());
});


test.each([
  ['PARTIAL_SUCCESS', 'DOWNLOADED', 'NOT_REQUESTED', '部分成功', COLORS.warning],
  ['PARTIAL_SUCCESS', 'DOWNLOAD_FAILED', 'NOT_REQUESTED', '部分成功 · 下载失败', COLORS.danger],
  ['PARTIAL_SUCCESS', 'DOWNLOADED', 'EXPORT_FAILED', '部分成功 · 保存失败', COLORS.danger],
  ['RUNNING', 'DOWNLOAD_FAILED', 'NOT_REQUESTED', '执行中', COLORS.primaryActive],
  ['RUNNING', 'IDLE', 'EXPORT_FAILED', '执行中', COLORS.primaryActive],
  ['QUEUED', 'DOWNLOAD_FAILED', 'EXPORT_FAILED', '排队中', COLORS.warning],
  ['SUCCESS', 'DOWNLOAD_FAILED', 'NOT_REQUESTED', '下载失败', COLORS.danger],
  ['SUCCESS', 'DOWNLOADED', 'EXPORT_FAILED', '保存失败', COLORS.danger],
] as const)('keeps the status label and color consistent for %s / %s / %s', (status, downloadState, exportState, label, color) => {
  const item: TaskCard = { id: 'status-test', prompt: 'A video', status, downloadState, exportState, resolution: '768p', duration: 5, createdAt: 1, updatedAt: 2 };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()} />); });
  const badge = tree.root.findAllByType(Text).find(node => node.props.children === label)!;
  expect(badge).toBeDefined();
  expect(StyleSheet.flatten(badge.props.style).color).toBe(color);
  act(() => tree.unmount());
});
