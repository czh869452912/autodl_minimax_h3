import React, { Component } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockMode: 'auto' | 'hardware' | 'software' | undefined = 'auto';
let mounts = 0;
let unmounts = 0;

class MockNativePlaybackHost extends Component<Record<string, unknown>> {
  componentDidMount() { mounts += 1; }
  componentWillUnmount() { unmounts += 1; }
  render() { return React.createElement('AutoDLVideoView', this.props); }
}

jest.mock('../settings/videoDecodeMode', () => ({ useVideoDecodeMode: () => mockMode }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('./unifiedPlayback', () => ({
  UnifiedVideoView: (props: Record<string, unknown>) => <MockNativePlaybackHost {...props} />,
  openExternalVideo: jest.fn(async () => undefined),
}));

import { VideoPlayer } from './VideoPlayer';

describe('unified playback routing', () => {
  beforeEach(() => {
    mockMode = 'auto';
    mounts = 0;
    unmounts = 0;
  });

  it.each([
    'file:///data/user/0/app/files/video.mp4',
    'content://media/external/video/7',
    'https://cdn.example.test/video.mp4',
  ])('sends %s to the same native playback contract', source => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source={source} />); });
    const view = tree.root.findByProps({ testID: 'unified-video-view' });

    expect(view.props).toMatchObject({ source, decodeMode: 'auto', retryToken: 0 });
    expect(mounts).toBe(1);
  });

  it('updates decode preference without recreating the active native playback host', () => {
    mockMode = 'hardware';
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="file:///video.mp4" />); });
    expect(tree.root.findByProps({ testID: 'unified-video-view' }).props.decodeMode).toBe('hardware');

    mockMode = 'software';
    act(() => tree.update(<VideoPlayer source="file:///video.mp4" />));

    expect(tree.root.findByProps({ testID: 'unified-video-view' }).props.decodeMode).toBe('software');
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });

  it('commits source and decode mode together without remounting the player', () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="file:///old.mp4" />); });
    mockMode = 'software';
    act(() => tree.update(<VideoPlayer source="content://media/external/video/9" />));
    expect(tree.root.findByProps({ testID: 'unified-video-view' }).props).toMatchObject({
      source: 'content://media/external/video/9', decodeMode: 'software', retryToken: 0,
    });
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });

  it('mounts once settings become available and stays mounted afterward', () => {
    mockMode = undefined;
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<VideoPlayer source="file:///video.mp4" />); });
    expect(mounts).toBe(0);

    mockMode = 'auto';
    act(() => tree.update(<VideoPlayer source="file:///video.mp4" />));
    expect(mounts).toBe(1);

    mockMode = 'hardware';
    act(() => tree.update(<VideoPlayer source="file:///video.mp4" />));
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });
});
