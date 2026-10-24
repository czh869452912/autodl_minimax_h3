import React from 'react';
import { act, create } from 'react-test-renderer';
import { Image } from 'react-native';
import { MediaPreview } from './MediaPreview';
import type { AssetVersion } from './types';
const mockExtract = jest.fn();
jest.mock('../native/media', () => ({ extractPoster: (...args: unknown[]) => mockExtract(...args) }));
const version = (id: string): AssetVersion => ({ id, assetId: 'asset', versionNo: 1, source: 'generated', state: 'AVAILABLE', relativePath: `${id}.mp4`, mime: 'video/mp4', recipe: {} });

afterEach(() => { jest.clearAllMocks(); });

test('shares decoding across tiles and never shows a previous version after its async poster arrives', async () => {
  const resolve = new Map<string, (uri: string) => void>();
  mockExtract.mockImplementation((uri: string) => new Promise(done => resolve.set(uri, done)));
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<><MediaPreview version={version('poster-a')} label="One" /><MediaPreview version={version('poster-a')} label="Two" /></>); });
    expect(mockExtract).toHaveBeenCalledTimes(1);
    const firstUri = mockExtract.mock.calls[0][0];
    await act(async () => { tree.update(<MediaPreview version={version('poster-b')} label="New" />); });
    await act(async () => resolve.get(firstUri)!('file:///old-poster.jpg'));
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    await act(async () => resolve.get(mockExtract.mock.calls[1][0])!('file:///new-poster.jpg'));
    expect(tree.root.findByType(Image).props.source.uri).toBe('file:///new-poster.jpg');
  } finally { act(() => tree?.unmount()); }
});

test('a failed video decode leaves a usable placeholder', async () => {
  mockExtract.mockRejectedValueOnce(new Error('bad codec'));
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<MediaPreview version={version('poster-failed')} kind="video" label="Video" />); });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('视频预览');
  } finally { act(() => tree?.unmount()); }
});

test('missing originals do not trigger native extraction', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<MediaPreview version={{ ...version('poster-missing'), state: 'MISSING' }} kind="video" label="Missing" />); });
    expect(mockExtract).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('原文件待恢复');
  } finally { act(() => tree?.unmount()); }
});
