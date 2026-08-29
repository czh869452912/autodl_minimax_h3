import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal } from 'react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void) => { require('react').useEffect(effect, [effect]); },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})) }));
jest.mock('../../src/tasks/repository', () => ({
  createTaskRepository: jest.fn(() => ({
    list: jest.fn(async () => [{
      id: 'task-1', prompt: 'cinematic city', status: 'SUCCESS', resolution: '768p竖', duration: 5,
      videoUrl: 'https://example/video.mp4', downloadState: 'DOWNLOADING', createdAt: 1, updatedAt: 2,
    }]),
    upsert: jest.fn(),
  })),
}));
jest.mock('../../src/native/media', () => ({ extractPoster: jest.fn(async () => undefined) }));
jest.mock('../../src/ui/icons', () => ({ AppIcon: () => null }));

import GalleryScreen from './gallery';

describe('gallery navigation', () => {
  beforeEach(() => mockPush.mockClear());

  it('opens the video detail route directly without an intermediate modal', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<GalleryScreen />); });
    await act(async () => renderer!.root.findByProps({ accessibilityLabel: '打开视频 cinematic city' }).props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/video/[id]', params: { id: 'task-1' } });
    expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
  });
});
