import React from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

const mockBack = jest.fn();
const mockCopy = jest.fn(async (_value: string) => undefined);
const mockReadClipboard = jest.fn(async () => task.prompt);
const mockList = jest.fn();
const mockGet = jest.fn();
const mockMediaGet = jest.fn();
const mockResolveLocal = jest.fn(async (..._args: unknown[]): Promise<string | undefined> => undefined);
const mockSync = jest.fn(async (..._args: unknown[]) => ({ tasks: [], summary: { operations: { remainingDue: 0, remainingScheduled: 0, budgetExhausted: false } } }));
const mockRequestExport = jest.fn(async (_taskId: string, _policy: { keepPrivateCopy: boolean }) => ({ status: 'queued' as const }));
const mockRequestRedownload = jest.fn(async (_taskId: string) => ({ status: 'queued' as const }));
const mockProbeVideo = jest.fn(async (_source: string) => undefined);
const task = {
  id: 'task-1', prompt: 'A very long prompt. '.repeat(300), status: 'SUCCESS' as const,
  resolution: '768p竖', duration: 5, videoUrl: 'https://example/video.mp4',
  downloadState: 'DOWNLOADING' as const, createdAt: 1, updatedAt: 2,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'task-1' }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../tasks/sync', () => ({
  taskStore: { list: () => mockList(), get: (id: string) => mockGet(id) },
  mediaStore: {
    get: (id: string) => mockMediaGet(id),
  },
  syncTaskRun: (...args: unknown[]) => mockSync(...args),
  requestTaskExport: (taskId: string, policy: { keepPrivateCopy: boolean }) => mockRequestExport(taskId, policy),
  requestTaskRedownload: (taskId: string) => mockRequestRedownload(taskId),
}));
jest.mock('../native/media', () => ({ probeVideo: (source: string) => mockProbeVideo(source) }));
jest.mock('../tasks/localMedia', () => ({ resolveLocalVideoSource: (...args: unknown[]) => mockResolveLocal(...args) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockCopy(value), getStringAsync: () => mockReadClipboard() }));
jest.mock('../media/VideoPlayer', () => ({
  VideoPlayer: (props: Record<string, unknown>) => require('react').createElement('View', { ...props, testID: 'video-player-mock' }),
}));

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
    mockRequestRedownload.mockClear();
    mockProbeVideo.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps long prompts in an independent scroll area and keeps actions reachable', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ accessibilityLabel: '滚动 Prompt' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: '返回画廊' })).toBeTruthy();
    expect(mockList).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('task-1');
  });

  it('uses the inline player and copies only after clipboard success', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('https://example/video.mp4');
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
    expect(mockCopy).toHaveBeenCalledWith(task.prompt);
    expect(Alert.alert).toHaveBeenCalledWith('已复制', 'Prompt 已复制到剪贴板');
  });

  it('warns when the native clipboard does not retain the complete prompt', async () => {
    mockReadClipboard.mockResolvedValue(`${task.prompt.slice(0, -1)}…`);
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
    expect(mockReadClipboard).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('复制不完整', '系统剪贴板未保留完整 Prompt，可能是键盘剪贴板或目标应用的长度限制。');
  });

  it('manually saves a downloaded private video to the gallery', async () => {
    mockGet.mockResolvedValue({ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' });
    mockResolveLocal.mockResolvedValue('file:///private.mp4');
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.onPress());
    expect(mockRequestExport).toHaveBeenCalledWith('task-1', { keepPrivateCopy: true });
    expect(mockSync).toHaveBeenCalledWith({ reason: 'foreground', mode: 'poll', taskIds: ['task-1'] });
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

    expect(tree!.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe(task.videoUrl);
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
