import { buildTaskPayload } from './api';

test('buildTaskPayload preserves generation options and reference data URIs', () => {
  expect(buildTaskPayload({
    prompt: 'camera move', duration: 8, resolution: '1080p横', seed: '42',
    images: [{ dataUri: 'data:image/png;base64,abc' }],
    audios: [{ dataUri: 'data:audio/mpeg;base64,xyz' }],
  })).toEqual({
    prompt: 'camera move', duration: 8, resolution: '1080p横', seed: 42,
    ref_image_1: 'data:image/png;base64,abc', ref_audio_1: 'data:audio/mpeg;base64,xyz',
  });
});
