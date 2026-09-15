import React from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { act, create as createRenderer } from 'react-test-renderer';

const mountedTrees: ReturnType<typeof createRenderer>[] = [];
function create(element: React.ReactElement) {
  const tree = createRenderer(element);
  mountedTrees.push(tree);
  return tree;
}

const mockBack = jest.fn();
const mockCopy = jest.fn(async (_value: string) => undefined);
const mockReadClipboard = jest.fn(async () => task.prompt);
const mockList = jest.fn();
const mockGet = jest.fn();
const mockMediaGet = jest.fn();
const mockResolveLocal = jest.fn(async (..._args: unknown[]): Promise<string | undefined> => undefined);
const mockSync = jest.fn(async (..._args: unknown[]) => ({ tasks: [], summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } } }));
const mockRequestExport = jest.fn(async (_taskId: string, _policy: { keepPrivateCopy: boolean }) => ({ status: 'queued' as const }));
const mockRequestDownload = jest.fn(async (_taskId: string) => ({ status: 'queued' as const }));
const mockRequestRedownload = jest.fn(async (_taskId: string) => ({ status: 'queued' as const }));
const mockProbeVideoStructure = jest.fn(async (_source: string) => undefined);
const task = {
  id: 'task-1', prompt: 'A very long prompt. '.repeat(300), status: 'SUCCESS' as const,
  resolution: '768p竖', duration: 5, videoUrl: 'https://example/video.mp4',
  downloadState: 'IDLE' as const, createdAt: 1, updatedAt: 2,
};

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ id: 'task-1' }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../tasks/taskServices', () => ({ getTaskServices: () => ({
  taskStore: { list: () => mockList(), get: (id: string) => mockGet(id) },
  mediaStore: {
    get: (id: string) => mockMediaGet(id),
  },

  taskCommandService: { requestExport: (taskId: string, policy: { keepPrivateCopy: boolean }) => mockRequestExport(taskId, policy),
  requestDownload: (taskId: string) => mockRequestDownload(taskId),
  requestRedownload: (taskId: string) => mockRequestRedownload(taskId) },
}) }));
jest.mock('../native/media', () => ({ probeVideoStructure: (source: string) => mockProbeVideoStructure(source) }));
jest.mock('../tasks/localMedia', () => ({ resolveLocalVideoSource: (...args: unknown[]) => mockResolveLocal(...args) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockCopy(value), getStringAsync: () => mockReadClipboard() }));
jest.mock('../media/VideoPlayer', () => ({
  VideoPlayer: (props: Record<string, unknown>) => require('react').createElement('View', { ...props, testID: 'video-player-mock' }),
}));

import { taskProjectionEvents } from '../tasks/taskProjectionEvents';
import VideoDetailScreen from '../../app/video/[id]';

describe('video detail screen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockCopy.mockClear();
    mockReadClipboard.mockReset();
    mockReadClipboard.mockResolvedValue(task.prompt);
    mockGet.mockReset();
    mockGet.mockResolvedValue(task);
    mockMediaGet.mockReset();
    mockMediaGet.mockResolvedValue(null);
    mockResolveLocal.mockReset();
    mockResolveLocal.mockResolvedValue(undefined);
    mockSync.mockClear();
    mockRequestExport.mockClear();
    mockRequestDownload.mockClear();
    mockRequestRedownload.mockClear();
    mockProbeVideoStructure.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => { act(() => { for (const tree of mountedTrees.splice(0)) tree.unmount(); }); jest.restoreAllMocks(); });

  it('observes asynchronous export completion and failure, then allows retry', async () => {
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    mockGet.mockResolvedValue({ ...task, exportState: 'QUEUED' });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.disabled).toBe(true);
    mockGet.mockResolvedValue({ ...task, exportState: 'EXPORT_FAILED', exportError: '相册权限不足' });
    await act(async () => taskProjectionEvents.invalidate());
    expect(tree.root.findByProps({ accessibilityLabel: '重试保存到系统相册' }).props.disabled).toBe(false);
    expect(tree.root.findAllByType(Text).some(node => node.props.children === '相册权限不足')).toBe(true);
    mockGet.mockResolvedValue({ ...task, exportState: 'EXPORTED' });
    await act(async () => taskProjectionEvents.invalidate());
    expect(tree.root.findAllByProps({ accessibilityLabel: '保存到系统相册' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('distinguishes read failures from deleted works and can retry', async () => {
    mockGet.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findByProps({ accessibilityLabel: '重试读取作品' })).toBeTruthy();
    expect(tree.root.findAllByType(Text).some(node => node.props.children === '作品不存在或已删除')).toBe(false);
    await act(async () => tree.root.findByProps({ accessibilityLabel: '重试读取作品' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'video-player-mock' })).toBeTruthy();
    act(() => tree.unmount());
  });

  it('keeps long prompts in an independent scroll area and keeps actions reachable', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ accessibilityLabel: '滚动 Prompt' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: '返回上一页' })).toBeTruthy();
    expect(mockList).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('task-1');
  });

  it('uses the inline player and copies only after clipboard success', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('https://example/video.mp4');
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
    expect(mockCopy).toHaveBeenCalledWith(task.prompt);
    expect(tree!.root.findAllByType(Text).some(node => node.props.children === 'Prompt 已复制到剪贴板')).toBe(true);
  });

  it('warns when the native clipboard does not retain the complete prompt', async () => {
    mockReadClipboard.mockResolvedValue(`${task.prompt.slice(0, -1)}…`);
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
    expect(mockReadClipboard).not.toHaveBeenCalled();
    expect(tree!.root.findAllByType(Text).some(node => node.props.children === 'Prompt 已复制到剪贴板')).toBe(true);
  });

  it('manually saves a downloaded private video to the gallery', async () => {
    mockGet.mockResolvedValue({ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' });
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.onPress());
    expect(mockRequestExport).toHaveBeenCalledWith('task-1', { keepPrivateCopy: true });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('uses a verified private file for playback without writing projections in the route', async () => {
    const staleTask = { ...task, downloadState: 'DOWNLOAD_FAILED' as const, downloadError: '域名不在允许列表' };
    const staleAsset = {
      id: 'asset-1', taskId: 'task-1', title: 'x', prompt: task.prompt,
      sourceUrl: task.videoUrl, mimeType: 'video/mp4', status: 'failed' as const,
      createdAt: 1, updatedAt: 2,
    };
    mockGet.mockResolvedValue(staleTask);
    mockMediaGet.mockResolvedValue(staleAsset);
    mockResolveLocal.mockResolvedValue('file:///documents/media/task-1.mp4');

    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });

    const texts = tree!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
    expect(texts.some((text) => text.includes('已下载'))).toBe(true);
    expect(tree!.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('file:///documents/media/task-1.mp4');

    await act(async () => tree!.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.onPress());
    expect(mockRequestExport).toHaveBeenCalledWith('task-1', { keepPrivateCopy: true });
  });

  it('queues a durable redownload when the verified local player reports invalid media', async () => {
    mockGet.mockResolvedValue({ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'EXPORTED' });
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    const player = tree!.root.findByProps({ testID: 'video-player-mock' });
    expect(player.props.validateSource).toEqual(expect.any(Function));
    await act(async () => player.props.onInvalidSource('file:///private.mp4'));
    expect(mockRequestRedownload).toHaveBeenCalledWith('task-1');
    expect(Alert.alert).toHaveBeenCalledWith('已开始重新下载', '已清除损坏的本地副本并开始重新下载');
  });

  it('does not present a missing private path as downloaded', async () => {
    mockGet.mockResolvedValue({ ...task, localUri: 'file:///missing.mp4', downloadState: 'DOWNLOAD_FAILED', downloadError: '文件丢失' });
    mockResolveLocal.mockResolvedValue(undefined);

    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });

    expect(tree!.root.findAllByProps({ testID: 'video-player-mock' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ accessibilityLabel: '保存到系统相册' })).toHaveLength(0);
    const texts = tree!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
    expect(texts.some((text) => text.includes('下载失败'))).toBe(true);
  });

  it('shows a recoverable state when a successful task has no media source', async () => {
    mockGet.mockResolvedValue({ ...task, videoUrl: undefined, localUri: undefined });
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ accessibilityLabel: '视频源不可用' })).toBeTruthy();
    expect(tree!.root.findAllByProps({ testID: 'video-player-mock' })).toHaveLength(0);
  });

  it('groups download failure recovery and restores playback after download completes', async () => {
    mockGet.mockResolvedValue({ ...task, downloadState: 'DOWNLOAD_FAILED', downloadError: '下载连接失败' });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findAllByProps({ testID: 'video-player-mock' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: '保存到系统相册' })).toHaveLength(0);
    await act(async () => tree.root.findByProps({ accessibilityLabel: '复制诊断详情' }).props.onPress());
    expect(mockCopy).toHaveBeenCalledWith('下载连接失败');
    await act(async () => tree.root.findByProps({ accessibilityLabel: '重试下载视频' }).props.onPress());
    expect(mockRequestDownload).toHaveBeenCalledWith('task-1');
    mockGet.mockResolvedValue({ ...task, downloadState: 'DOWNLOADED' });
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    await act(async () => taskProjectionEvents.invalidate());
    expect(tree.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('file:///private.mp4');
    expect(tree.root.findByProps({ accessibilityLabel: '保存到系统相册' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '重试下载视频' })).toHaveLength(0);
  });

  it('disables repeat downloads while queued and omits unsupported-media retry', async () => {
    mockGet.mockResolvedValue({ ...task, downloadState: 'ENQUEUED' });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findByProps({ accessibilityLabel: '下载视频' }).props.disabled).toBe(true);
    await act(async () => tree.root.findByProps({ accessibilityLabel: '下载视频' }).props.onPress());
    expect(mockRequestDownload).not.toHaveBeenCalled();
    mockGet.mockResolvedValue({ ...task, downloadState: 'DOWNLOAD_FAILED', downloadError: 'ARTIFACT_MEDIA_UNSUPPORTED' });
    await act(async () => taskProjectionEvents.invalidate());
    expect(tree.root.findAllByProps({ accessibilityLabel: '重试下载视频' })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: '复制诊断详情' })).toBeTruthy();
  });

  it.each(['ENQUEUED', 'DOWNLOADING'] as const)('shows %s progress instead of playing either remote URL, then restores local playback', async (downloadState) => {
    mockGet.mockResolvedValue({ ...task, downloadState, downloadProgress: 0.42 });
    mockMediaGet.mockResolvedValue({ taskId: task.id, sourceUrl: 'https://example/asset.mp4' });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findAllByProps({ testID: 'video-player-mock' })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: downloadState === 'ENQUEUED' ? '等待下载' : '下载中 42%' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '下载视频' }).props.disabled).toBe(true);
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    mockGet.mockResolvedValue({ ...task, downloadState: 'DOWNLOADED' });
    await act(async () => taskProjectionEvents.invalidate());
    expect(tree.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('file:///private.mp4');
  });

  it('keeps an available local video playable while a download is queued', async () => {
    mockGet.mockResolvedValue({ ...task, downloadState: 'ENQUEUED' });
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('file:///private.mp4');
  });

  it('does not offer playback or downloads for a failed generation with a stale URL', async () => {
    mockGet.mockResolvedValue({ ...task, status: 'FAILED', syncError: '生成失败' });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree.root.findByProps({ accessibilityLabel: '视频生成失败' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'video-player-mock' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: '下载视频' })).toHaveLength(0);
  });

  it('expands media through available height and pins the bounded prompt section below it', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'detail-content' }).props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'adaptive-media-region' }).props.style)).toMatchObject({ flex: 1 });
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'video-frame' }).props.style)).not.toHaveProperty('aspectRatio');
    expect(StyleSheet.flatten(tree!.root.findByProps({ accessibilityLabel: '滚动 Prompt' }).props.style)).toMatchObject({ maxHeight: 240 });
    expect(tree!.root.findByProps({ testID: 'bottom-prompt-card' })).toBeTruthy();
  });
});

