import { buildAutodlSubmitRequest, normalizeAutodlStatus, parseAutodlResult } from './mapping';

test('maps canonical H3 inputs to the current AutoDL payload', () => {
  expect(buildAutodlSubmitRequest({ prompt: 'p', resolution: '768p竖', duration: 5, seed: '42', images: [{ dataUri: 'data:image/png;base64,a' }], audios: [{ dataUri: 'data:audio/mpeg;base64,b' }] })).toEqual({ prompt: 'p', resolution: '768p竖', duration: 5, seed: 42, ref_image_0: 'data:image/png;base64,a', ref_audio_0: 'data:audio/mpeg;base64,b' });
});

test('normalizes provider status and result video URL', () => {
  expect(normalizeAutodlStatus('SUCCESSFUL')).toBe('SUCCEEDED');
  expect(normalizeAutodlStatus('EXECUTING')).toBe('RUNNING');
  expect(parseAutodlResult({ results: [{ type: 'video', url: 'https://cdn.test/result?id=1' }] })).toMatchObject([{ kind: 'video', uri: 'https://cdn.test/result?id=1', mime: 'video/mp4' }]);
});

test('preserves every nested provider output and infers artifact kinds', () => {
  expect(parseAutodlResult({
    results: [
      { id: 'clip-main', type: 'video', url: 'https://cdn.test/final.mp4?token=old' },
      { artifact_id: 'poster', output: { mime_type: 'image/png', url: 'https://cdn.test/poster' } },
      { files: ['https://cdn.test/narration.wav', 'https://cdn.test/manifest.json'] },
    ],
  })).toEqual([
    expect.objectContaining({ id: 'clip-main', kind: 'video', uri: 'https://cdn.test/final.mp4?token=old', mime: 'video/mp4' }),
    expect.objectContaining({ id: 'poster', kind: 'image', uri: 'https://cdn.test/poster', mime: 'image/png' }),
    expect.objectContaining({ id: 'artifact:2', kind: 'audio', uri: 'https://cdn.test/narration.wav', mime: 'audio/wav' }),
    expect.objectContaining({ id: 'artifact:3', kind: 'json', uri: 'https://cdn.test/manifest.json', mime: 'application/json' }),
  ]);
});

test('uses provider ids or result position instead of signed URLs for stable identity', () => {
  const first = parseAutodlResult({ results: [
    { result_id: 'provider-video-7', url: 'https://cdn.test/video.mp4?token=first' },
    'https://cdn.test/poster.png?token=first',
  ] });
  const refreshed = parseAutodlResult({ results: [
    { result_id: 'provider-video-7', url: 'https://cdn.test/video.mp4?token=second' },
    'https://cdn.test/poster.png?token=second',
  ] });

  expect(first.map((artifact) => artifact.id)).toEqual(['provider-video-7', 'artifact:1']);
  expect(refreshed.map((artifact) => artifact.id)).toEqual(first.map((artifact) => artifact.id));
});

test('normalizes partial provider completion without discarding produced artifacts', () => {
  expect(normalizeAutodlStatus('PARTIAL_SUCCESS')).toBe('PARTIAL_SUCCEEDED');
  expect(parseAutodlResult({ results: {
    completed: [{ id: 'usable-output', mime: 'image/webp', download_url: 'https://cdn.test/usable' }],
    errors: [{ message: 'second branch failed' }],
  } })).toEqual([
    expect.objectContaining({ id: 'usable-output', kind: 'image', uri: 'https://cdn.test/usable', mime: 'image/webp' }),
  ]);
});
