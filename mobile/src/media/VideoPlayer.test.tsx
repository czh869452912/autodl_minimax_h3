import React, { Suspense, startTransition } from 'react';
import { NativeModules } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockMode: 'auto' | 'hardware' | 'software' | undefined = 'auto';

jest.mock('../settings/videoDecodeMode', () => ({
  useVideoDecodeMode: () => mockMode,
}));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('./unifiedPlayback', () => ({
  UnifiedVideoView: (props: object) => require('react').createElement('AutoDLVideoView', props),
  openExternalVideo: (source: string) => require('react-native').NativeModules.AutoDLMedia.openExternalVideo(source),
}));

import { VideoPlayer } from './VideoPlayer';

type PlaybackStatus = 'loading' | 'firstFrame' | 'playing' | 'paused' | 'ended' | 'decodeFailed' | 'sourceUnavailable';

function emit(tree: ReactTestRenderer, status: PlaybackStatus, positionMs = 0) {
  const view = tree.root.findByProps({ testID: 'unified-video-view' });
  act(() => view.props.onPlayback({ nativeEvent: { status, positionMs, source: view.props.source, retryToken: view.props.retryToken } }));
}

describe('unified video player', () => {
  beforeEach(() => {
    mockMode = 'auto';
    NativeModules.AutoDLMedia = { openExternalVideo: jest.fn(async () => undefined) };
  });

  it('accepts committed playback events while a replacement render is suspended', async () => {
    const pending = new Promise<void>(() => {});
    const suspend = jest.fn(({ blocked }: { blocked: boolean }) => { if (blocked) throw pending; return null; });
    function Blocker(props: { blocked: boolean }) { return suspend(props); }
    const render = (source: string, blocked: boolean) => <Suspense fallback={null}>
      <VideoPlayer source={source} poster="file:///poster.jpg" />
      <Blocker blocked={blocked} />
    </Suspense>;
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(render('file:///committed.mp4', false)); });
    const committed = tree.root.findByProps({ testID: 'unified-video-view' }).props;
    await act(async () => {
      startTransition(() => tree.update(render('file:///pending.mp4', true)));
    });
    expect(suspend.mock.calls.some(([props]) => props.blocked)).toBe(true);
    expect(tree.root.findByProps({ testID: 'unified-video-view' }).props.source).toBe('file:///committed.mp4');
    await act(async () => committed.onPlayback({ nativeEvent: {
      source: 'file:///committed.mp4', retryToken: 0, status: 'firstFrame', positionMs: 20,
    } }));
    expect(tree.root.findAllByProps({ testID: 'video-poster' })).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  it('preserves the empty state and waits for decode settings before mounting native playback', () => {
    let empty!: ReactTestRenderer;
    act(() => { empty = create(<VideoPlayer source=" " />); });
    expect(empty.root.findByProps({ accessibilityLabel: '视频源不可用' })).toBeTruthy();
    expect(empty.root.findAllByProps({ testID: 'unified-video-view' })).toHaveLength(0);

    mockMode = undefined;
    let pending!: ReactTestRenderer;
    act(() => { pending = create(<VideoPlayer source="file:///video.mp4" />); });
    expect(pending.root.findAllByProps({ testID: 'unified-video-view' })).toHaveLength(0);
  });

  it('keeps the poster visible until native playback reports a true first frame', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="file:///video.mp4" poster="file:///poster.jpg" />); });

    expect(tree.root.findByProps({ testID: 'video-poster' })).toBeTruthy();
    emit(tree, 'playing', 120);
    expect(tree.root.findByProps({ testID: 'video-poster' })).toBeTruthy();
    emit(tree, 'firstFrame', 140);
    expect(tree.root.findAllByProps({ testID: 'video-poster' })).toHaveLength(0);
  });

  it('retries through retryToken while leaving the native view mounted', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="https://example.test/video.mp4" />); });
    const original = tree.root.findByType('AutoDLVideoView' as never);

    emit(tree, 'decodeFailed', 800);
    act(() => tree.root.findByProps({ accessibilityLabel: '重试播放' }).props.onPress());

    const retried = tree.root.findByType('AutoDLVideoView' as never);
    expect(retried).toBe(original);
    expect(retried.props.retryToken).toBe(1);
    expect(retried.props.source).toBe('https://example.test/video.mp4');
    expect(retried.props.decodeMode).toBe('auto');
  });

  it('offers durable redownload only when validation proves a local source is corrupt', async () => {
    const validateSource = jest.fn(async () => { throw Object.assign(new Error('invalid bytes'), { code: 'MEDIA_NAL_INVALID' }); });
    const onInvalidSource = jest.fn(async () => undefined);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<VideoPlayer source="file:///broken.mp4" validateSource={validateSource} onInvalidSource={onInvalidSource} />); });

    await act(async () => emit(tree, 'decodeFailed'));
    expect(validateSource).toHaveBeenCalledWith('file:///broken.mp4');
    expect(tree.root.findAllByProps({ accessibilityLabel: '重试播放' })).toHaveLength(0);
    await act(async () => tree.root.findByProps({ accessibilityLabel: '重新下载视频' }).props.onPress());
    expect(onInvalidSource).toHaveBeenCalledWith('file:///broken.mp4');
  });

  it.each([
    ['valid local bytes', async () => undefined],
    ['transient validation failure', async () => { throw Object.assign(new Error('unavailable'), { code: 'MEDIA_INTEGRITY_UNAVAILABLE' }); }],
    ['decoder validation failure', async () => { throw Object.assign(new Error('decoder'), { code: 'MEDIA_DECODE_FAILED' }); }],
  ])('keeps explicit recovery actions for %s', async (_case, validateSource) => {
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<VideoPlayer source="content://media/video/7" validateSource={validateSource} onInvalidSource={jest.fn()} />); });
    await act(async () => emit(tree, 'decodeFailed'));

    expect(tree.root.findByProps({ accessibilityLabel: '重试播放' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '使用外部播放器打开' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '重新下载视频' })).toHaveLength(0);
  });

  it('does not run local integrity validation for a network playback failure', async () => {
    const validateSource = jest.fn(async () => { throw Object.assign(new Error('invalid'), { code: 'MEDIA_INVALID' }); });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<VideoPlayer source="https://expired.test/video.mp4" validateSource={validateSource} onInvalidSource={jest.fn()} />); });
    emit(tree, 'sourceUnavailable');

    expect(validateSource).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: '重试播放' })).toBeTruthy();
  });

  it('validates Android file:/ URIs before offering durable redownload', async () => {
    const validateSource = jest.fn(async () => { throw Object.assign(new Error('invalid'), { code: 'MEDIA_INVALID' }); });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<VideoPlayer source="file:/data/user/0/app/files/broken.mp4" validateSource={validateSource} onInvalidSource={jest.fn()} />); });
    await act(async () => emit(tree, 'decodeFailed'));

    expect(validateSource).toHaveBeenCalledWith('file:/data/user/0/app/files/broken.mp4');
    expect(tree.root.findByProps({ accessibilityLabel: '重新下载视频' })).toBeTruthy();
  });

  it('ignores a queued event echoed from a replaced source or retry attempt', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="file:///first.mp4" />); });
    const oldHandler = tree.root.findByProps({ testID: 'unified-video-view' }).props.onPlayback;
    act(() => tree.update(<VideoPlayer source="file:///second.mp4" />));
    act(() => oldHandler({ nativeEvent: { status: 'decodeFailed', positionMs: 0, source: 'file:///first.mp4', retryToken: 0 } }));

    expect(tree.root.findAllByProps({ accessibilityLabel: '重试播放' })).toHaveLength(0);

    emit(tree, 'decodeFailed');
    const retryZeroHandler = tree.root.findByProps({ testID: 'unified-video-view' }).props.onPlayback;
    act(() => tree.root.findByProps({ accessibilityLabel: '重试播放' }).props.onPress());
    act(() => retryZeroHandler({ nativeEvent: { status: 'decodeFailed', positionMs: 0, source: 'file:///second.mp4', retryToken: 0 } }));
    expect(tree.root.findAllByProps({ accessibilityLabel: '重试播放' })).toHaveLength(0);
  });

  it('opens the unchanged source in an external player from the failure state', async () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="file:///video.mp4" />); });
    emit(tree, 'sourceUnavailable');
    await act(async () => tree.root.findByProps({ accessibilityLabel: '使用外部播放器打开' }).props.onPress());

    expect(NativeModules.AutoDLMedia.openExternalVideo).toHaveBeenCalledWith('file:///video.mp4');
  });
});
