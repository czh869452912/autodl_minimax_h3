import { buildAutodlSubmitRequest, normalizeAutodlStatus, parseAutodlResult } from './mapping';

test('maps canonical H3 inputs to the current AutoDL payload', () => {
  expect(buildAutodlSubmitRequest({ prompt: 'p', resolution: '768p竖', duration: 5, seed: '42', images: [{ dataUri: 'data:image/png;base64,a' }], audios: [{ dataUri: 'data:audio/mpeg;base64,b' }] })).toEqual({ prompt: 'p', resolution: '768p竖', duration: 5, seed: 42, ref_image_1: 'data:image/png;base64,a', ref_audio_1: 'data:audio/mpeg;base64,b' });
});

test('normalizes provider status and result video URL', () => {
  expect(normalizeAutodlStatus('SUCCESSFUL')).toBe('SUCCEEDED');
  expect(normalizeAutodlStatus('EXECUTING')).toBe('RUNNING');
  expect(parseAutodlResult({ results: [{ type: 'video', url: 'https://cdn.test/result?id=1' }] })).toMatchObject([{ kind: 'video', uri: 'https://cdn.test/result?id=1', mime: 'video/mp4' }]);
});
