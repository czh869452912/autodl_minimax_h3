import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

const mockBack = jest.fn();
const mockCopy = jest.fn(async (_value: string) => undefined);
const mockList = jest.fn();
const mockExport = jest.fn(async (value: typeof task) => ({ ...value, exportState: 'EXPORTED' as const, galleryUri: 'content://media/video/7' }));
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
jest.mock('../../src/tasks/repository', () => ({
  createTaskRepository: jest.fn(() => ({ list: () => mockList() })),
}));
jest.mock('../../src/tasks/media', () => ({ exportTaskVideo: (...args: unknown[]) => mockExport(args[0] as typeof task) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockCopy(value) }));
jest.mock('../../src/media/VideoPlayer', () => ({
  VideoPlayer: (props: Record<string, unknown>) => require('react').createElement('View', { ...props, testID: 'video-player-mock' }),
}));

import VideoDetailScreen from './[id]';

describe('video detail screen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockCopy.mockClear();
    mockList.mockResolvedValue([task]);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps long prompts in an independent scroll area and keeps actions reachable', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ accessibilityLabel: '滚动 Prompt' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' })).toBeTruthy();
    expect(tree!.root.findByProps({ accessibilityLabel: '返回画廊' })).toBeTruthy();
  });

  it('uses the inline player and copies only after clipboard success', async () => {
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    expect(tree!.root.findByProps({ testID: 'video-player-mock' }).props.source).toBe('https://example/video.mp4');
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
    expect(mockCopy).toHaveBeenCalledWith(task.prompt);
    expect(Alert.alert).toHaveBeenCalledWith('已复制', 'Prompt 已复制到剪贴板');
  });

  it('manually saves a downloaded private video to the gallery', async () => {
    mockList.mockResolvedValue([{ ...task, localUri: 'file:///private.mp4', downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' }]);
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoDetailScreen />); });
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '保存到系统相册' }).props.onPress());
    expect(mockExport).toHaveBeenCalled();
  });

  it('shows a recoverable state when a successful task has no media source', async () => {
    mockList.mockResolvedValue([{ ...task, videoUrl: undefined, localUri: undefined }]);
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
