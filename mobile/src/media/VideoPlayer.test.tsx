import React from 'react';
import { act, create } from 'react-test-renderer';

const mockPlayer = {
  muted: false,
  loop: false,
  keepScreenOnWhilePlaying: false,
  bufferOptions: {},
  replay: jest.fn(),
  play: jest.fn(),
};
const mockUseVideoPlayer = jest.fn((_source: string | null, setup?: (player: typeof mockPlayer) => void) => {
  setup?.(mockPlayer);
  return mockPlayer;
});
let mockStatus = { status: 'readyToPlay', error: undefined as { message: string } | undefined };

jest.mock('expo-video', () => ({
  useVideoPlayer: (source: string | null, setup?: (player: typeof mockPlayer) => void) => mockUseVideoPlayer(source, setup),
  VideoView: (props: Record<string, unknown>) => require('react').createElement('VideoView', props),
}));
jest.mock('expo', () => ({ useEvent: () => mockStatus }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import { VideoPlayer } from './VideoPlayer';

describe('inline video player', () => {
  beforeEach(() => {
    mockUseVideoPlayer.mockClear();
    mockPlayer.replay.mockClear();
    mockPlayer.play.mockClear();
    mockStatus = { status: 'readyToPlay', error: undefined };
  });

  it('renders inline native controls with fullscreen enabled', () => {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<VideoPlayer source="file:///video.mp4" poster="file:///poster.jpg" />); });
    const view = tree!.root.findByProps({ testID: 'inline-video-view' });
    expect(mockUseVideoPlayer).toHaveBeenCalledWith('file:///video.mp4', expect.any(Function));
    expect(view.props.nativeControls).toBe(true);
    expect(view.props.fullscreenOptions).toMatchObject({ enable: true, orientation: 'default' });
    expect(view.props.surfaceType).toBe('textureView');
    expect(view.props.useExoShutter).toBe(false);
  });

  it('renders an empty state without constructing a player', () => {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<VideoPlayer source="" />); });
    expect(mockUseVideoPlayer).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ accessibilityLabel: '视频源不可用' })).toBeTruthy();
  });

  it('offers an explicit retry after playback failure', () => {
    mockStatus = { status: 'error', error: { message: 'decoder failed' } };
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<VideoPlayer source="https://example/video.mp4" />); });
    act(() => tree!.root.findByProps({ accessibilityLabel: '重试播放' }).props.onPress());
    expect(mockPlayer.replay).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });
});
