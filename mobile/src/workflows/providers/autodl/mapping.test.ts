import { buildAutodlSubmitRequest, normalizeAutodlStatus, parseAutodlResult } from './mapping';

test('maps H3 reference slots from zero exactly as provider metadata declares', () => {
  const payload = buildAutodlSubmitRequest({
    prompt: 'p', resolution: '768p竖', duration: 15,
    images: [{ dataUri: 'data:image/png;base64,AA==', mime: 'image/png' }],
    audios: [{ dataUri: 'data:audio/mpeg;base64,AA==', mime: 'audio/mpeg' }],
  });
  expect(payload.ref_image_0).toBe('data:image/png;base64,AA==');
  expect(payload.ref_audio_0).toBe('data:audio/mpeg;base64,AA==');
  expect(payload).not.toHaveProperty('ref_image_9');
  expect(payload).not.toHaveProperty('ref_audio_3');
});

test.each(['SUCCESS', 'SUCCEEDED', 'successful', 'completed', 'COMPLETE'])(
  'normalizes terminal success %s',
  (status) => expect(normalizeAutodlStatus(status)).toBe('SUCCEEDED'),
);

test('extracts only declared result entries and rejects placeholders', () => {
  expect(parseAutodlResult({ results: [{ url: 'https://cdn.example.test/video.mp4', type: 'video', file_type: 'mp4' }] })[0]).toMatchObject({
    uri: 'https://cdn.example.test/video.mp4', kind: 'video', mime: 'video/mp4',
  });
  expect(parseAutodlResult({ results: [{ url: 'https://', type: 'video' }], debug_url: 'https://internal.example.test/' })).toEqual([]);
});
