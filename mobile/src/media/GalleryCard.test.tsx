import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { GalleryCard } from './GalleryCard';
import type { MediaAsset } from './types';

test('renders a localized label instead of the stored export enum', async () => {
  const asset: MediaAsset = {
    id: 'asset-1', taskId: 'task-1', title: 'Video', prompt: 'prompt', sourceUrl: 'https://cdn/video.mp4',
    mimeType: 'video/mp4', kind: 'video', status: 'downloaded', exportStatus: 'EXPORTED', createdAt: 1, updatedAt: 2,
  };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<GalleryCard asset={asset} onPress={() => undefined} />); });
  const root = renderer.root;
  const text = root.findAllByType(Text).map((node) => node.props.children).flat(Infinity).join('');

  expect(text).toContain('已保存到相册');
  expect(text).not.toContain('EXPORTED');
});
