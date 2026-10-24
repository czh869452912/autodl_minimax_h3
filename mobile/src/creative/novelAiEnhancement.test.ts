import { createEnhanceInput, enhanceScales, enhancementPatch, enhanceOutputSize } from './novelAiEnhancement';
import { defaultNovelAiDraft, novelAiDraftInput, prepareNovelAiRequest } from './novelAiProtocol';

test('available scales follow official limits, special standard sizes and model capabilities', () => {
  const model = defaultNovelAiDraft.model;
  expect(enhanceScales(832, 1216, model)).toEqual(['1', '1.5', 'max']);
  expect(enhanceScales(1216, 832, model)).toEqual(['1', '1.5', 'max']);
  expect(enhanceScales(640, 640, model)).toEqual(['1', '1.5', '2', 'max']);
  expect(enhanceScales(1024, 1024, model)).toEqual(['1', '1.5', 'max']);
  expect(enhanceScales(1536, 2048, model)).toEqual(['1']);
  expect(enhanceScales(832, 1216, 'nai-diffusion-4-5-full')).toEqual(['1', '1.5']);
  expect(enhanceScales(4096, 4096, model)).toEqual([]);
});
test('numeric Enhance preserves the selected source, adjusts dimensions and sends custom strength without Max flag', () => {
  const input = createEnhanceInput({ ...defaultNovelAiDraft, prompt: 'scene', seed: 123, samples: 4, extraNoiseSeed: 32 }, 'chosen-history', 832, 1216);
  const numeric = { ...input, ...enhancementPatch({ ...input.enhancement!, scale: '1.5' }), strength: 0.35, noise: 0.05 };
  const { snapshot, requestJson } = prepareNovelAiRequest(numeric, () => 0.5, { image: 'original-base64' });
  const body = JSON.parse(requestJson);
  expect(snapshot).toMatchObject({ sourceVersionId: 'chosen-history', seed: 2147483648, samples: 1, width: 1280, height: 1856, enhancement: { scale: '1.5', sourceWidth: 832, sourceHeight: 1216 } });
  expect(body.parameters).toMatchObject({ image: 'original-base64', strength: 0.35, noise: 0.05, n_samples: 1, width: 1280, height: 1856 });
  expect(body.parameters.upscaled_enhance).toBeUndefined();
  expect(body.input).toContain('-2::upscaled, blurry::');
  expect(body.parameters.v4_prompt.caption.base_caption).toBe(body.input);
});
test('Max sends original request size and upscaled_enhance, while its estimated output follows official pixel ceiling', () => {
  const input = createEnhanceInput({ ...defaultNovelAiDraft, prompt: 'scene' }, 'original', 832, 1216);
  expect(input).toMatchObject({ seed: null, extraNoiseSeed: null, strength: 0.5, noise: 0, enhance: true });
  expect(enhanceOutputSize(input.enhancement!)).toEqual({ width: 1467, height: 2144 });
  const body = JSON.parse(prepareNovelAiRequest(input, () => 0.5, { image: 'original' }).requestJson);
  expect(body.parameters).toMatchObject({ width: 832, height: 1216, upscaled_enhance: true });
  expect(body.input).not.toContain('-2::upscaled, blurry::');
});
test('stale dimensions, batch, mode and unsupported scale cannot bypass Enhance validation', () => {
  const input = createEnhanceInput({ ...defaultNovelAiDraft, prompt: 'scene' }, 'original', 832, 1216);
  for (const patch of [{ width: 1024 }, { samples: 2 }, { action: 'generate' }, { enhance: false }, { strength: 0 }, { noise: 1 }, { enhancement: { ...input.enhancement!, scale: '2' } }]) {
    expect(novelAiDraftInput.safeParse({ ...input, ...patch }).success).toBe(false);
  }
  expect(() => createEnhanceInput(input, 'large', 4096, 4096)).toThrow('倍率');
});
test('numeric enhancement prompt stays before explicit text and is never added twice', () => {
  const input = createEnhanceInput({ ...defaultNovelAiDraft, prompt: 'a sign, text: STARS', qualityPreset: 'none' }, 'original', 640, 640);
  const numeric = { ...input, ...enhancementPatch({ ...input.enhancement!, scale: '2' }) };
  const body = JSON.parse(prepareNovelAiRequest(numeric, Math.random, { image: 'original' }).requestJson);
  expect(body.input).toMatch(/-2::upscaled, blurry::, .*text: STARS$/);
  const again = JSON.parse(prepareNovelAiRequest({ ...numeric, prompt: body.input }, Math.random, { image: 'original' }).requestJson);
  expect(again.input.match(/-2::upscaled, blurry::/g)).toHaveLength(1);
});
test('1.5× Medium settings agree with the image actually enhanced in the official browser', () => {
  const evidence = require('../../../docs/evidence/2026-10-24-novelai-v5-full/enhance-1_5-official.metadata.json');
  const original = evidence.parameters;
  const input = createEnhanceInput({ ...defaultNovelAiDraft, prompt: 'a small brass telescope, isolated object, clean silhouette, anime illustration', transparent: true, effort: 'medium' }, 'original', 832, 1216);
  const body = JSON.parse(prepareNovelAiRequest({ ...input, ...enhancementPatch({ ...input.enhancement!, scale: '1.5' }), strength: 0.35, noise: 0.05, seed: original.seed }, Math.random, { image: 'original' }).requestJson);
  expect(body.input).toBe(original.prompt);
  for (const key of ['width', 'height', 'steps', 'scale', 'seed', 'sampler', 'strength', 'noise', 'extra_noise_seed', 'straight_alpha', 'tag_hint_transparent_background', 'tag_hint_uc_preset', 'tag_hint_qt']) expect(body.parameters[key]).toEqual(original[key]);
  expect(evidence).toMatchObject({ width: 1280, height: 1856 });
});
