import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal } from 'react-native';

const mockPush = jest.fn();
let mockPosterPath: string | undefined;
const mockPage = jest.fn();
const mockMediaUpsert = jest.fn(async (_value: unknown) => undefined);
const mockResolveLocal = jest.fn(async () => 'file:///video.mp4' as string | undefined);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../tasks/repository', () => ({
  createTaskRepository: jest.fn(() => ({
    list: jest.fn(async () => []),
    upsert: jest.fn(),
  })),
}));
jest.mock('../tasks/localMedia', () => ({ resolveLocalVideoSource: () => mockResolveLocal() }));
jest.mock('../media/repository', () => ({
  createSqliteMediaStore: jest.fn(() => ({
    listPage: jest.fn(async (options: unknown) => mockPage(options) ?? ({ items: [{ id: 'job-1:video-1', taskId: 'task-1', title: 'cinematic city', prompt: 'cinematic city', sourceUrl: 'https://example/video.mp4', localPath: 'file:///video.mp4', posterPath: mockPosterPath, mimeType: 'video/mp4', kind: 'video', status: 'downloaded', createdAt: 1, updatedAt: 2 }] })),
    upsert: (value: unknown) => mockMediaUpsert(value),
  })),
}));
jest.mock('../media/catalog', () => ({ reconcileMediaCatalog: jest.fn(async () => ({ scanned: 0, materialized: 0 })) }));
jest.mock('../native/media', () => ({ extractPoster: jest.fn(async () => undefined) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import GalleryScreen from '../../app/(tabs)/gallery';

describe('gallery navigation', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  beforeEach(() => { mockPosterPath = undefined; mockPush.mockClear(); mockMediaUpsert.mockClear(); mockResolveLocal.mockReset(); mockResolveLocal.mockResolvedValue('file:///video.mp4'); });

  it('opens the video detail route directly without an intermediate modal', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<GalleryScreen />); });
    await act(async () => renderer!.root.findByProps({ accessibilityLabel: '打开视频 cinematic city' }).props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/video/[id]', params: { id: 'job-1:video-1' } });
    expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
    act(() => { renderer!.unmount(); jest.runOnlyPendingTimers(); });
  });

  it('reflows on folding and large text without losing the selected video', async () => {
    const rn = require('react-native');
    const dimensions = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 840, height: 900, scale: 2, fontScale: 1 });
    let tree!: ReturnType<typeof create>;
    try {
      await act(async () => { tree = create(<GalleryScreen />); });
      const list = () => tree.root.findByType(rn.FlatList);
      act(() => list().props.onLayout({ nativeEvent: { layout: { width: 792 } } }));
      expect(list().props.numColumns).toBe(4);
      act(() => tree.root.findByProps({ accessibilityLabel: '打开视频 cinematic city' }).props.onLongPress());
      dimensions.mockReturnValue({ width: 360, height: 900, scale: 3, fontScale: 1.5 });
      act(() => tree.update(<GalleryScreen />));
      act(() => list().props.onLayout({ nativeEvent: { layout: { width: 336 } } }));
      expect(list().props.numColumns).toBe(1);
      expect(list().props.columnWrapperStyle).toBeUndefined();
      expect(tree.root.findByProps({ accessibilityLabel: '打开视频 cinematic city' }).props.accessibilityState.selected).toBe(true);
    } finally {
      act(() => tree?.unmount());
      dimensions.mockRestore();
    }
  });

  it('downgrades a downloaded asset whose private file is missing', async () => {
    mockResolveLocal.mockResolvedValueOnce(undefined);
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<GalleryScreen />); });
    const texts = renderer!.root.findAllByType(require('react-native').Text).map((node) => [node.props.children].flat(Infinity).join(''));
    expect(texts).toContain('— · 准备中');
    expect(mockMediaUpsert).not.toHaveBeenCalled();
    act(() => { renderer!.unmount(); jest.runOnlyPendingTimers(); });
  });
});

it('discards an old corrupted poster even when regeneration cannot produce a replacement', async () => {
  mockPosterPath = 'file:///documents/posters/old.jpg';
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<GalleryScreen />); });
  expect(mockMediaUpsert).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(require('react-native').Image).some(node => node.props.source?.uri === mockPosterPath)).toBe(false);
  act(() => renderer.unmount());
  mockPosterPath = undefined;
});


it('discards a slow old search after a new query and completes a query cleared during debounce', async () => {
  jest.useFakeTimers();
  let release!: (page: unknown) => void;
  mockPage.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<GalleryScreen />); });
  act(() => tree.root.findByProps({ accessibilityLabel: '搜索作品' }).props.onChangeText('new'));
  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => release({ items: [{ id: 'old', title: 'obsolete' }] }));
  expect(tree.root.findAllByType(require('react-native').Text).some(node => node.props.children === 'obsolete')).toBe(false);
  act(() => { tree.root.findByProps({ accessibilityLabel: '搜索作品' }).props.onChangeText('temp'); });
  act(() => { tree.root.findByProps({ accessibilityLabel: '搜索作品' }).props.onChangeText('new'); });
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(tree.root.findByType(require('react-native').FlatList).props.refreshing).toBe(false);
  act(() => tree.unmount()); jest.useRealTimers();
});

it('clears both search and status from an empty filtered result and still opens creation', async () => {
  jest.useFakeTimers();
  mockPage.mockImplementation(() => ({ items: [] }));
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<GalleryScreen />); });
    await act(async () => tree.root.findByProps({ accessibilityRole: 'radio', accessibilityLabel: '失败' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: '搜索作品' }).props.onChangeText('missing'));
    await act(async () => { jest.advanceTimersByTime(300); });
    await act(async () => tree.root.findByProps({ accessibilityRole: 'button', accessibilityLabel: '清除筛选' }).props.onPress());
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(tree.root.findByProps({ accessibilityLabel: '搜索作品' }).props.value).toBe('');
    expect(tree.root.findByProps({ accessibilityRole: 'radio', accessibilityLabel: '全部' }).props.accessibilityState.checked).toBe(true);
    expect(mockPage).toHaveBeenLastCalledWith(expect.objectContaining({ query: '', status: undefined }));
    act(() => tree.root.findByProps({ accessibilityRole: 'button', accessibilityLabel: '去生成视频' }).props.onPress());
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/create');
  } finally {
    act(() => tree?.unmount());
    mockPage.mockReset();
    jest.useRealTimers();
  }
});
