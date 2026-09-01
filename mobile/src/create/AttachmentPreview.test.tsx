import React from 'react';
import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';

const mockUseAudioPlayer = jest.fn((_source?: string) => ({ pause: jest.fn(), play: jest.fn() }));

jest.mock('expo-audio', () => ({
  useAudioPlayer: (source?: string) => mockUseAudioPlayer(source),
  useAudioPlayerStatus: () => ({ duration: 0, playing: false }),
}));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import { AudioPreviewList, ImagePreviewGrid } from './AttachmentPreview';

describe('reference media previews', () => {
  beforeEach(() => mockUseAudioPlayer.mockClear());

  it('prefers local image URIs and falls back to legacy data URIs', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ImagePreviewGrid
          items={[
            { uri: 'file:///local.png', dataUri: 'data:image/png;base64,bG9jYWw=', name: 'local.png' },
            { dataUri: 'data:image/png;base64,bGVnYWN5', name: 'legacy.png' },
          ]}
          onRemove={() => undefined}
        />,
      );
    });

    expect(tree.root.findAllByType(Image).map((node) => node.props.source.uri)).toEqual([
      'file:///local.png',
      'data:image/png;base64,bGVnYWN5',
    ]);
    act(() => tree.unmount());
  });

  it('prefers local audio URIs and falls back to legacy data URIs', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <AudioPreviewList
          items={[
            { uri: 'file:///local.mp3', dataUri: 'data:audio/mpeg;base64,bG9jYWw=', name: 'local.mp3' },
            { dataUri: 'data:audio/mpeg;base64,bGVnYWN5', name: 'legacy.mp3' },
          ]}
          onRemove={() => undefined}
        />,
      );
    });

    expect(mockUseAudioPlayer.mock.calls.map(([source]) => source)).toEqual([
      'file:///local.mp3',
      'data:audio/mpeg;base64,bGVnYWN5',
    ]);
    act(() => tree.unmount());
  });
});
