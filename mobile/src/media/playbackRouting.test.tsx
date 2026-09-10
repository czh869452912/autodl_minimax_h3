import { NativeModules, Platform } from 'react-native';
import React from 'react';
import { act, create } from 'react-test-renderer';

const mockPlayer = { pause: jest.fn(), currentTime: 4.2, play: jest.fn(), replay: jest.fn() };
let mockStatus = { status: 'error' };
const mockUseVideo = jest.fn(() => mockPlayer);
const mockPrefer = jest.fn(async () => false);
jest.mock('expo-video', () => ({ useVideoPlayer: () => mockUseVideo(), VideoView: (props: object) => require('react').createElement('VideoView', props) }));
jest.mock('expo', () => ({ useEvent: () => mockStatus }));
jest.mock('../settings/videoDecodeMode', () => ({ useVideoDecodeMode: () => 'auto' }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('./softwarePlayback', () => ({
  ...jest.requireActual('./softwarePlayback'),
  preferSoftwarePlayback: () => mockPrefer(),
  openExternalVideo: jest.fn(),
  SoftwareVideoView: (props: object) => require('react').createElement('SoftwareVideoView', props),
}));
import { VideoPlayer } from './VideoPlayer';

beforeEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }); NativeModules.AutoDLMedia = { softwareVideoPlayback: true }; jest.clearAllMocks(); mockPrefer.mockResolvedValue(false); mockStatus = { status: 'error' }; });
test('known Hi10P uses software without constructing Media3', async () => {
  mockPrefer.mockResolvedValue(true);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="file:///high10.mp4" />); });
  expect(mockUseVideo).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ testID: 'software-video-view' })).toBeTruthy();
  act(() => tree.unmount());
});
test('decoder failure switches once and preserves position; software failure does not loop back', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="file:///high10.mp4" validateSource={async () => { throw { code: 'MEDIA_CODEC_UNSUPPORTED' }; }} />); });
  const software = tree.root.findByProps({ testID: 'software-video-view' });
  expect(software.props.initialPositionMs).toBe(4200);
  expect(mockPlayer.pause).toHaveBeenCalled();
  act(() => software.props.onPlayback({ nativeEvent: { status: 'decodeFailed', positionMs: 4200 } }));
  expect(tree.root.findAllByProps({ testID: 'software-video-view' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: 'inline-video-view' })).toHaveLength(0);
  expect(tree.root.findByProps({ accessibilityLabel: '重试兼容播放' })).toBeTruthy();
  act(() => tree.unmount());
});
test('proven corrupt source is not sent to software fallback', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="file:///broken.mp4" validateSource={async () => { throw { code: 'MEDIA_INVALID' }; }} onInvalidSource={jest.fn()} />); });
  expect(tree.root.findAllByProps({ testID: 'software-video-view' })).toHaveLength(0);
  expect(tree.root.findByProps({ accessibilityLabel: '重新下载视频' })).toBeTruthy();
  act(() => tree.unmount());
});
test('remote network failure stays in Media3', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<VideoPlayer source="https://expired.test/a.mp4" />); });
  expect(mockPrefer).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ testID: 'software-video-view' })).toHaveLength(0);
  act(() => tree.unmount());
});

test('remote buffering beyond the local watchdog does not switch decoders or probe metadata', async () => {
  jest.useFakeTimers();
  mockStatus = { status: 'loading' };
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<VideoPlayer source="https://slow.test/a.mp4" />); });
    expect(tree.root.findByProps({ testID: 'inline-video-view' })).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(mockPrefer).not.toHaveBeenCalled();
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'software-video-view' })).toHaveLength(0);
  } finally { act(() => tree?.unmount()); jest.useRealTimers(); }
});

test('production metadata probe short-circuits HTTPS even when manual software playback is available', async () => {
  const nativeProbe = jest.fn();
  NativeModules.AutoDLMedia.videoPlaybackInfo = nativeProbe;
  const actual = jest.requireActual<typeof import('./softwarePlayback')>('./softwarePlayback');
  expect(actual.canUseSoftwarePlayback('https://cdn.test/a.mp4')).toBe(true);
  expect(await actual.preferSoftwarePlayback('https://cdn.test/a.mp4')).toBe(false);
  expect(nativeProbe).not.toHaveBeenCalled();
});
