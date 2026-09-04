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
    expect(tree!.root.findByProps({ testID: 'video-poster' }).props.pointerEvents).toBe('none');
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

  it('keeps retry playback when a local source still passes validation', async () => {
    mockStatus = { status: 'error', error: { message: 'decoder failed' } };
    const validateSource = jest.fn(async () => undefined);
    const onInvalidSource = jest.fn();
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoPlayer source="file:///video.mp4" validateSource={validateSource} onInvalidSource={onInvalidSource} />); });
    expect(validateSource).toHaveBeenCalledWith('file:///video.mp4');
    expect(tree!.root.findByProps({ accessibilityLabel: '重试播放' })).toBeTruthy();
    expect(tree!.root.findAllByProps({ accessibilityLabel: '重新下载视频' })).toHaveLength(0);
  });

  it('offers durable redownload only when a local source is proven invalid', async () => {
    mockStatus = { status: 'error', error: { message: 'Invalid NAL length' } };
    const validateSource = jest.fn(async () => { throw Object.assign(new Error('opaque native detail'), { code: 'MEDIA_INVALID' }); });
    const onInvalidSource = jest.fn(async () => undefined);
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<VideoPlayer source="file:///video.mp4" validateSource={validateSource} onInvalidSource={onInvalidSource} />); });
    await act(async () => tree!.root.findByProps({ accessibilityLabel: '重新下载视频' }).props.onPress());
    expect(onInvalidSource).toHaveBeenCalledWith('file:///video.mp4');
    expect(tree!.root.findAllByProps({ accessibilityLabel: '重试播放' })).toHaveLength(0);
  });

  it('does not invalidate remote sources or local sources after a transient probe failure', async () => {
    mockStatus = { status: 'error', error: { message: 'network' } };
    const remoteValidate = jest.fn(async () => { throw Object.assign(new Error('invalid'), { code: 'MEDIA_INVALID' }); });
    let remote: ReturnType<typeof create>;
    await act(async () => { remote = create(<VideoPlayer source="https://example/video.mp4" validateSource={remoteValidate} onInvalidSource={jest.fn()} />); });
    expect(remoteValidate).not.toHaveBeenCalled();
    expect(remote!.root.findByProps({ accessibilityLabel: '重试播放' })).toBeTruthy();

    const transient = jest.fn(async () => { throw Object.assign(new Error('bridge unavailable'), { code: 'MEDIA_INTEGRITY_UNAVAILABLE' }); });
    let local: ReturnType<typeof create>;
    await act(async () => { local = create(<VideoPlayer source="file:///video.mp4" validateSource={transient} onInvalidSource={jest.fn()} />); });
    expect(local!.root.findByProps({ accessibilityLabel: '重试播放' })).toBeTruthy();
    expect(local!.root.findAllByProps({ accessibilityLabel: '重新下载视频' })).toHaveLength(0);
  });
});
