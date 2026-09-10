import React from 'react';
import { act, create } from 'react-test-renderer';
let mockMode: 'auto' | 'hardware' | 'software' = 'auto';
const mockPrefer = jest.fn(async () => false);
const mockPlayer = { pause: jest.fn(), currentTime: 3, status: 'readyToPlay' };
let mockStatus = 'readyToPlay';
jest.mock('../settings/videoDecodeMode', () => ({ useVideoDecodeMode: () => mockMode }));
jest.mock('./softwarePlayback', () => ({
  canUseSoftwarePlayback: () => true,
  preferSoftwarePlayback: () => mockPrefer(),
  openExternalVideo: jest.fn(),
  SoftwareVideoView: (props: object) => require('react').createElement('Software', props),
  HardwareVideoView: (props: object) => require('react').createElement('Hardware', props),
}));
jest.mock('expo-video', () => ({ useVideoPlayer: () => mockPlayer, VideoView: (props: object) => require('react').createElement('Automatic', props) }));
jest.mock('expo', () => ({ useEvent: () => ({ status: mockStatus, isPlaying: true }) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
import { VideoPlayer } from './VideoPlayer';

beforeEach(() => { mockMode = 'auto'; mockStatus = 'readyToPlay'; mockPrefer.mockResolvedValue(false); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());
test.each(['hardware', 'software'] as const)('%s bypasses automatic selection and preserves explicit mode on failure', async mode => {
  mockMode = mode;
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="file:///high10.mp4" />); });
  expect(tree.root.findAllByType(mode === 'hardware' ? 'Hardware' as never : 'Software' as never)).toHaveLength(1);
  const view = tree.root.findByType(mode === 'hardware' ? 'Hardware' as never : 'Software' as never);
  act(() => view.props.onPlayback({ nativeEvent: { status: 'decodeFailed', positionMs: 10 } }));
  expect(tree.root.findAllByType('Software' as never)).toHaveLength(0);
  expect(tree.root.findAllByType('Hardware' as never)).toHaveLength(0);
  act(() => tree.unmount());
});
test('auto uses software for a known unsupported profile', async () => {
  mockPrefer.mockResolvedValue(true);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="file:///high10.mp4" />); });
  expect(tree.root.findAllByType('Software' as never)).toHaveLength(1);
  act(() => tree.unmount());
});
test('auto falls back once when the device produces no first frame', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="file:///video.mp4" />); });
  expect(tree.root.findAllByType('Automatic' as never)).toHaveLength(1);
  await act(async () => { jest.advanceTimersByTime(15_000); });
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(tree.root.findByType('Software' as never).props.initialPositionMs).toBe(3000);
  act(() => tree.unmount());
});
test('a centralized mode update replaces the active backend', async () => {
  mockMode = 'hardware';
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="https://example.test/video.mp4" />); });
  mockMode = 'software';
  act(() => tree.update(<VideoPlayer source="https://example.test/video.mp4" />));
  expect(tree.root.findAllByType('Hardware' as never)).toHaveLength(0);
  expect(tree.root.findAllByType('Software' as never)).toHaveLength(1);
  act(() => tree.unmount());
});
