import { defaultNovelAiDraft, prepareNovelAiRequest, parseNovelAiResponse } from './novelAiProtocol';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=';
test('snapshot freezes seed, preserves character pairing and does not inject quality or negative text', () => {
  const result = prepareNovelAiRequest({ ...defaultNovelAiDraft, prompt: 'a scene', characters: [{ prompt: 'astronomer', negative: 'hat', x: 0.2, y: 0.7 }] }, () => 0.5);
  const body = JSON.parse(result.requestJson);
  expect(result.snapshot.seed).toBe(2147483648);
  expect(body.parameters.seed).toBe(result.snapshot.seed);
  expect(body.parameters.v4_negative_prompt.caption.char_captions).toEqual([{ char_caption: 'hat', centers: [{ x: 0.2, y: 0.7 }] }]);
  expect(body.parameters.negative_prompt).toBe('');
  expect(body.parameters.qualityToggle).toBe(false);
  expect(prepareNovelAiRequest(result.snapshot).requestHash).toBe(result.requestHash);
});
test('unsupported inputs, dimensions and model combinations are rejected instead of silently dropped', () => {
  for (const patch of [{ width: 999 }, { width: 1536, height: 1536 }, { reference_image: 'unapproved' }, { model: 'nai-diffusion-5-curated', noiseSchedule: 'native' }, { characters: Array(7).fill({ prompt: 'a', negative: '', x: 0.5, y: 0.5 }) }]) {
    expect(() => prepareNovelAiRequest({ ...defaultNovelAiDraft, prompt: 'scene', ...patch })).toThrow();
  }
});
test('response parser accepts actual seed and rejects malformed, oversized and unexpected multi-output data', () => {
  const raw = { images: [{ image: png, seed: 123, index: 0 }] };
  expect(parseNovelAiResponse(JSON.stringify(raw))[0]).toMatchObject({ seed: 123, width: 1, height: 1 });
  expect(() => parseNovelAiResponse(JSON.stringify({ images: [...raw.images, ...raw.images] }))).toThrow();
  expect(() => parseNovelAiResponse(JSON.stringify({ images: [{ ...raw.images[0], image: 'not png!' }] }))).toThrow();
  expect(() => parseNovelAiResponse(JSON.stringify({ images: [{ image: png, index: 0 }] }))).toThrow();
});
