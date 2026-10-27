import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, StyleSheet, Text } from 'react-native';
import { TaskCardRow } from './TaskCardRow';
import { COLORS } from '../ui/theme';
import type { TaskCard } from './taskCard';
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

test('NovelAI image jobs open creative results instead of offering legacy video download and export',()=>{
  const item:TaskCard={id:'image-job',adapterId:'novelai-image',prompt:'an observatory',status:'SUCCESS',resolution:'',duration:0,createdAt:1,updatedAt:2,downloadState:'IDLE',exportState:'NOT_REQUESTED'};
  const onOpen=jest.fn(),onDownload=jest.fn();let tree!:ReturnType<typeof create>;
  try {
    act(()=>{tree=create(<TaskCardRow item={item} busy={false} onOpen={onOpen} onDownload={onDownload} onExport={jest.fn()} onRemove={jest.fn()} />);});
    expect(tree.root.findAllByProps({accessibilityLabel:'下载视频'})).toHaveLength(0);
    expect(tree.root.findAllByType(Text).some(n=>n.props.children==='图片')).toBe(true);
    act(()=>tree.root.findByProps({accessibilityLabel:'查看创作结果'}).props.onPress());
    expect(onOpen).toHaveBeenCalledWith('image-job');expect(onDownload).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

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

test('active removal is visibly disabled and archival has a full touch target', () => {
  const item: TaskCard = { id: 'job:123456789', prompt: 'p', status: 'RUNNING', resolution: '720p', duration: 5, createdAt: 1, updatedAt: 2, downloadState: 'IDLE', exportState: 'NOT_REQUESTED' };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TaskCardRow item={item} busy={false} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()} onArchive={jest.fn()} />); });
  const remove = tree.root.findByProps({ accessibilityLabel: '移除任务记录' });
  expect(remove.props.disabled).toBe(true);
  expect(StyleSheet.flatten(remove.props.style({ pressed: false })).opacity).toBe(0.45);
  const archive = tree.root.findByProps({ accessibilityLabel: '归档任务' });
  expect(StyleSheet.flatten(archive.props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(48);
  act(() => tree.unmount());
});

test('compact cards retain their summary and timing while only actions expand',async()=>{
 const item:TaskCard={id:'v',prompt:'A moving camera',adapterId:'autodl',status:'SUCCESS',resolution:'768p',duration:5,createdAt:1000,startedAt:61000,updatedAt:66000,executionDuration:5,downloadState:'DOWNLOADED',exportState:'NOT_REQUESTED'};
 let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<TaskCardRow compact item={item} busy={false} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()} onOpen={jest.fn()}/>);});
  const text=()=>tree.root.findAllByType(Text).map(n=>[n.props.children].flat().join(''));
  expect(text()).toContain('排队 1分00秒');expect(text()).toContain('执行 0分05秒');
  act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='展开任务操作'&&n.props.onPress)[0].props.onPress());
  expect(text().filter(t=>t==='A moving camera')).toHaveLength(1);expect(text()).toContain('执行 0分05秒');
  act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='收起任务操作'&&n.props.onPress)[0].props.onPress());
  expect(text()).toContain('A moving camera');expect(text()).toContain('排队 1分00秒');
 }finally{act(()=>tree?.unmount());}
});

test('collapsed task exposes download progress and opens video results directly',async()=>{
 const item:TaskCard={id:'progress',prompt:'Camera move',status:'SUCCESS',resolution:'720p',duration:5,createdAt:1,updatedAt:2,downloadState:'DOWNLOADING',downloadProgress:.42,exportState:'NOT_REQUESTED'};
 const open=jest.fn();let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<TaskCardRow compact item={item} busy={false} onOpen={open} onDownload={jest.fn()} onExport={jest.fn()} onRemove={jest.fn()}/>);});
  expect(tree.root.findByProps({accessibilityLabel:'下载进度'}).props.accessibilityValue.now).toBe(42);
  act(()=>tree.root.findByProps({accessibilityLabel:'查看创作结果'}).props.onPress());
  expect(open).toHaveBeenCalledWith('progress');
  expect(tree.root.findAllByProps({accessibilityLabel:'移除任务记录'})).toHaveLength(0);
 }finally{act(()=>tree?.unmount());}
});
