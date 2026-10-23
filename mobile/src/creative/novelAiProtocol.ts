import { z } from 'zod';
import CryptoJS from 'crypto-js';
import { Buffer } from 'buffer';

export const NOVELAI_CAPABILITIES_VERSION = '2026-10-23-basic-1';
export const NOVELAI_MODELS = ['nai-diffusion-4-5-curated','nai-diffusion-4-5-full','nai-diffusion-5-curated'] as const;
const text = z.string().max(10000);
const dimension = z.number().int().min(64).max(1536).multipleOf(64);
export const novelAiDraftInput = z.object({
  schemaVersion: z.literal(1).default(1), model: z.enum(NOVELAI_MODELS), prompt: text, negative: text,
  width: dimension, height: dimension, steps: z.number().int().min(1).max(50), guidance: z.number().min(0).max(10),
  rescale: z.number().min(0).max(1), seed: z.number().int().min(0).max(4294967295).nullable(),
  sampler: z.enum(['k_euler_ancestral','k_euler','k_dpmpp_2m']), noiseSchedule: z.enum(['karras','native','exponential']),
  characters: z.array(z.object({ prompt: text, negative: text, x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()).max(6),
  useCoordinates: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.width * value.height > 2097152) ctx.addIssue({ code: 'custom', message: '图片像素总数不能超过 2097152' });
  if (value.model === 'nai-diffusion-5-curated' && value.noiseSchedule !== 'karras') ctx.addIssue({ code: 'custom', message: 'V5 基础模式仅开放 Karras 噪声计划' });
});
export type NovelAiDraftInput = z.output<typeof novelAiDraftInput>;
export const defaultNovelAiDraft: NovelAiDraftInput = { schemaVersion: 1, model: 'nai-diffusion-4-5-curated', prompt: '', negative: '', width: 832, height: 1216, steps: 23, guidance: 5, rescale: 0, seed: null, sampler: 'k_euler_ancestral', noiseSchedule: 'karras', characters: [], useCoordinates: false };

/** Build only supported fields. Imported unknown metadata is never forwarded. */
export function prepareNovelAiRequest(value: unknown, random = Math.random) {
  const draft = novelAiDraftInput.parse(value);
  if (!draft.prompt.trim() && !draft.characters.some(c => c.prompt.trim())) throw new Error('请输入图片或角色提示词');
  const seed = draft.seed ?? Math.floor(random() * 4294967296);
  const snapshot = { ...draft, seed };
  const captions = (negative: boolean) => ({ caption: { base_caption: negative ? draft.negative : draft.prompt,
    char_captions: draft.characters.map(c => ({ char_caption: negative ? c.negative : c.prompt, centers: [{ x: c.x, y: c.y }] })) }, use_coords: draft.useCoordinates, use_order: true });
  const body = { input: draft.prompt, model: draft.model, action: 'generate', parameters: {
    params_version: 4, width: draft.width, height: draft.height, steps: draft.steps, scale: draft.guidance,
    cfg_rescale: draft.rescale, seed, n_samples: 1, sampler: draft.sampler, noise_schedule: draft.noiseSchedule,
    negative_prompt: draft.negative, qualityToggle: false, ucPreset: 3, image_format: 'png',
    v4_prompt: captions(false), v4_negative_prompt: captions(true),
  } };
  const requestJson = JSON.stringify(body);
  return { snapshot, requestJson, requestHash: CryptoJS.SHA256(requestJson).toString(), capabilitiesVersion: NOVELAI_CAPABILITIES_VERSION };
}

export function parseNovelAiResponse(raw: string) {
  if (raw.length > 20 * 1024 * 1024) throw new Error('NOVELAI_RESPONSE_TOO_LARGE');
  const parsed = z.object({ images: z.array(z.object({ image: z.string().min(1).max(16 * 1024 * 1024), index: z.number().int().min(0), seed: z.number().int().min(0).max(4294967295) })).length(1) }).parse(JSON.parse(raw));
  return parsed.images.map(image => {
    if (image.index !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.image) || image.image.length % 4 !== 0) throw new Error('NOVELAI_IMAGE_INVALID');
    const bytes = Buffer.from(image.image, 'base64');
    if (bytes.length < 33 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12,16).toString('ascii') !== 'IHDR') throw new Error('NOVELAI_IMAGE_INVALID');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width * height > 2097152 || bytes.length > 12 * 1024 * 1024) throw new Error('NOVELAI_IMAGE_TOO_LARGE');
    return { ...image, width, height, mime: 'image/png' as const };
  });
}
