import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal } from 'react-native';

const mockPush = jest.fn();
let mockPosterPath: string | undefined;
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
    listPage: jest.fn(async () => ({ items: [{ id: 'job-1:video-1', taskId: 'task-1', title: 'cinematic city', prompt: 'cinematic city', sourceUrl: 'https://example/video.mp4', localPath: 'file:///video.mp4', posterPath: mockPosterPath, mimeType: 'video/mp4', kind: 'video', status: 'downloaded', createdAt: 1, updatedAt: 2 }] })),
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

  it('downgrades a downloaded asset whose private file is missing', async () => {
    mockResolveLocal.mockResolvedValueOnce(undefined);
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<GalleryScreen />); });
    const texts = renderer!.root.findAllByType(require('react-native').Text).map((node) => [node.props.children].flat(Infinity).join(''));
    expect(texts).toContain('— · 准备中');
    expect(mockMediaUpsert).toHaveBeenCalledWith(expect.objectContaining({ localPath: undefined, status: 'queued' }));
    act(() => { renderer!.unmount(); jest.runOnlyPendingTimers(); });
  });
});

it('discards an old corrupted poster even when regeneration cannot produce a replacement', async () => {
  mockPosterPath = 'file:///documents/posters/old.jpg';
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<GalleryScreen />); });
  expect(mockMediaUpsert).toHaveBeenCalledWith(expect.objectContaining({ posterPath: undefined }));
  expect(renderer.root.findAllByType(require('react-native').Image).some(node => node.props.source?.uri === mockPosterPath)).toBe(false);
  act(() => renderer.unmount());
  mockPosterPath = undefined;
});
