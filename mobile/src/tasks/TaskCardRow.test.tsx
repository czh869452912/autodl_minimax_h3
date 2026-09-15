import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Pressable, Text } from 'react-native';
import { TaskCardRow } from './TaskCardRow';
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
