import {expandPromptChunks} from './promptChunks';
import { z } from 'zod';
import CryptoJS from 'crypto-js';
import { Buffer } from 'buffer';
import { addAutoText, negativePrefix, NEGATIVE_PRESETS, presetHint, QUALITY_PRESETS, qualitySuffix, splitPromptMix } from './novelAiPresets';
import { enhanceRequestSize, enhanceScales } from './novelAiEnhancement';
import { isImageBase64 } from '../media/base64';

export const NOVELAI_CAPABILITIES_VERSION = '2026-10-24-v5-full-enhance-3';
export const NOVELAI_MODELS = ['nai-diffusion-5-full', 'nai-diffusion-5-curated', 'nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated'] as const;
export const NOVELAI_SAMPLERS = ['k_euler_ancestral', 'k_euler', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m_sde', 'k_dpmpp_2m', 'k_dpmpp_sde'] as const;
export const samplerNames = ['Euler Ancestral', 'Euler', 'DPM++ 2S Ancestral', 'DPM++ 2M SDE', 'DPM++ 2M', 'DPM++ SDE'];
export const NOVELAI_MAX_PIXELS = 3145728;
export const NOVELAI_MAX_RESPONSE = 64 * 1024 * 1024;
const text = z.string().max(10000);
const versionId = z.string().min(1).max(200).nullable().default(null);
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const dimension = z.number().int().min(64).max(49152).multipleOf(64);
export const novelAiDraftInput = z.object({
  schemaVersion: z.literal(1).default(1), model: z.enum(NOVELAI_MODELS), prompt: text, negative: text,
  width: dimension, height: dimension, steps: z.number().int().min(1).max(50), guidance: z.number().min(0).max(10),
  rescale: z.number().min(0).max(1), seed: z.number().int().min(0).max(4294967295).nullable(),
  sampler: z.enum(NOVELAI_SAMPLERS), noiseSchedule: z.enum(['karras', 'native', 'exponential', 'polyexponential']),
  characters: z.array(point.extend({ prompt: text, negative: text, enabled: z.boolean().default(true) }).strict()).max(32),
  useCoordinates: z.boolean(),
  // Preserve old recipes: new preset fields default to none on existing saved input.
  qualityPreset: z.enum(QUALITY_PRESETS).default('none'), negativePreset: z.enum(NEGATIVE_PRESETS).default('none'),
  mode: z.enum(['anime', 'furry', 'background']).default('anime'), effort: z.enum(['high', 'medium']).default('high'),
  samples: z.number().int().min(1).max(4).default(1), transparent: z.boolean().default(false), straightAlpha: z.boolean().default(true),
  autoText: z.boolean().default(true), action: z.enum(['generate', 'img2img', 'infill']).default('generate'),
  enhance: z.boolean().default(false),
  enhancement: z.object({ scale: z.enum(['1', '1.5', '2', 'max']), sourceWidth: z.number().int().min(64).max(49152), sourceHeight: z.number().int().min(64).max(49152) }).strict().nullable().default(null),
  sourceVersionId: versionId, maskVersionId: versionId,
  maskStrokes: z.array(z.object({ radius: z.number().min(0.005).max(0.25), points: z.array(point).min(1).max(2048) }).strict()).max(100).default([]),
  strength: z.number().min(0).max(1).default(0.7), noise: z.number().min(0).max(1).default(0),
  extraNoiseSeed: z.number().int().min(-1).max(4294967295).nullable().default(null),
  inpaintStrength: z.number().min(0).max(1).default(1), addOriginalImage: z.boolean().default(true),
  chunks: z.array(z.object({ name: z.string().min(1).max(80), text }).strict()).max(50).default([]),
}).strict().superRefine((value, ctx) => {
  const v5 = value.model.startsWith('nai-diffusion-5');
  if (value.enhancement) {
    const e = value.enhancement, size = enhanceRequestSize(e);
    if (value.action !== 'img2img' || value.samples !== 1 || !value.sourceVersionId || value.enhance !== (e.scale === 'max') ||
      !enhanceScales(e.sourceWidth, e.sourceHeight, value.model).includes(e.scale) || value.width !== size.width || value.height !== size.height ||
      value.strength < 0.01 || value.strength > 0.99 || value.noise > 0.99)
      ctx.addIssue({ code: 'custom', message: 'Enhance 的底图、倍率、尺寸或强度已改变，请在增强面板中重新选择' });
  }
  if (value.width * value.height > NOVELAI_MAX_PIXELS) ctx.addIssue({ code: 'custom', message: '图片像素总数不能超过 3145728' });
  if (value.characters.length > (v5 ? 32 : 6)) ctx.addIssue({ code: 'custom', message: v5 ? '最多 32 个角色' : 'V4.5 最多 6 个角色' });
  if (v5 && value.noiseSchedule !== 'karras') ctx.addIssue({ code: 'custom', message: 'V5 使用 Karras 噪声计划' });
  if (!v5 && value.noiseSchedule === 'native') ctx.addIssue({ code: 'custom', message: 'V4.5 不支持原生噪声计划' });
  if (value.effort === 'medium' && value.model !== 'nai-diffusion-5-full') ctx.addIssue({ code: 'custom', message: 'Medium 仅适用于 V5 Full' });
  if (!v5 && value.transparent) ctx.addIssue({ code: 'custom', message: '透明背景需要 V5' });
  if (!v5 && value.qualityPreset === 'light') ctx.addIssue({ code: 'custom', message: '轻度质量预设需要 V5' });
  if (value.maskStrokes.reduce((n, s) => n + s.points.length, 0) > 4096) ctx.addIssue({ code: 'custom', message: '蒙版笔画过多，请清理后重试' });
});
export type NovelAiDraftInput = z.output<typeof novelAiDraftInput>;
export type NovelAiCharacter = NovelAiDraftInput['characters'][number];
export const defaultNovelAiDraft: NovelAiDraftInput = novelAiDraftInput.parse({ schemaVersion: 1, model: 'nai-diffusion-5-full', prompt: '', negative: '', width: 832, height: 1216, steps: 23, guidance: 7, rescale: 0, seed: null, sampler: 'k_euler_ancestral', noiseSchedule: 'karras', characters: [], useCoordinates: false, qualityPreset: 'standard', negativePreset: 'heavy' });
export const isNovelAiMedium = (input: Pick<NovelAiDraftInput, 'model' | 'effort'>) => input.model === 'nai-diffusion-5-full' && input.effort === 'medium';
export const novelAiModelName = (model: string) => model.replace('nai-diffusion-', 'V').replace('4-5', '4.5').replace('-curated', ' Curated').replace('-full', ' Full');
export const novelAiSourceIds = (input: NovelAiDraftInput) => input.action === 'generate' ? [] : [...new Set([input.sourceVersionId, ...(input.action === 'infill' ? [input.maskVersionId] : [])].filter((id): id is string => Boolean(id)))];

export function prepareNovelAiRequest(value: unknown, random = Math.random, media?: { image: string; mask?: string }) {
  const draft = novelAiDraftInput.parse(value), v5 = draft.model.startsWith('nai-diffusion-5'), medium = isNovelAiMedium(draft);
  const resolve=(text:string)=>expandPromptChunks(text,draft.chunks);
  const characters = draft.characters.filter(c => c.enabled && c.prompt.trim()).map(c=>({...c,prompt:resolve(c.prompt),negative:resolve(c.negative)}));
  if (!draft.prompt.trim() && !characters.length) throw new Error('请输入图片或角色提示词');
  if (draft.action !== 'generate' && (!draft.sourceVersionId || !media?.image)) throw new Error('请先选择底图');
  if (draft.action === 'infill' && (!media?.mask || (!draft.maskVersionId && !draft.maskStrokes.length))) throw new Error('请绘制或选择重绘蒙版');
  if (draft.action === 'infill' && draft.model === 'nai-diffusion-5-curated') throw new Error('V5 Curated 没有原生重绘模型，请切换 V5 Full');
  if(draft.enhance && (draft.action!=='img2img' || !v5 || draft.samples!==1))throw new Error('最大画质增强需要 V5、图生图和单张输出');
  const seed = draft.seed ?? Math.floor(random() * 4294967296);
  const snapshot = { ...draft, seed, ...(draft.action !== 'generate' ? { extraNoiseSeed: draft.extraNoiseSeed ?? seed - 1 } : {}) };
  let prompt = resolve(draft.prompt);
  if (draft.mode !== 'anime' && !/^(fur|background) dataset/.test(prompt)) prompt = `${draft.mode === 'furry' ? 'fur' : 'background'} dataset, ${prompt}`;
  const pieces = [draft.transparent && !/(?:^|,\s*)transparent background(?:,|$)/i.test(prompt) ? 'transparent background' : '', qualitySuffix(draft.model, draft.qualityPreset)].filter(Boolean);
  const mixes=splitPromptMix(prompt), base=mixes[0], textBlock = base.search(/(?:^|[\s,.:\[\]{}、。])text:(?!:)/i);
  if (pieces.length) mixes[0] = textBlock < 0 ? [base, ...pieces].filter(Boolean).join(', ') : `${[base.slice(0, textBlock).replace(/[\s,]+$/, ''), ...pieces].filter(Boolean).join(', ')}, ${base.slice(textBlock).replace(/^[\s,]+/, '')}`;
  prompt=mixes.join('|');
  if (draft.enhancement && draft.enhancement.scale !== 'max' && !prompt.includes('upscaled, blurry')) {
    const index = prompt.search(/(?:^|[\s,.:\[\]{}、。])text:(?!:)/i);
    prompt = index < 0 ? `${prompt}, -2::upscaled, blurry::,` : `${prompt.slice(0, index)}, -2::upscaled, blurry::, ${prompt.slice(index)}`;
  }
  if (v5 && draft.autoText) prompt = addAutoText(prompt, characters, draft.useCoordinates);
  const ucPreset = medium ? 'heavy' : draft.negativePreset;
  let negative = [negativePrefix(draft.model, ucPreset), medium ? '' : resolve(draft.negative)].filter(Boolean).join(', ');
  if (ucPreset !== 'none' && draft.model.endsWith('-full') && !prompt.toLowerCase().includes('nsfw')) negative = `nsfw, ${negative}`;
  const captions = (isNegative: boolean) => ({ caption: { base_caption: isNegative ? negative : prompt,
    char_captions: characters.map(c => ({ char_caption: isNegative ? medium ? '' : c.negative : c.prompt, centers: [{ x: c.x, y: c.y }] })) },
    ...(isNegative ? { legacy_uc: false } : { use_coords: draft.useCoordinates, use_order: true }) });
  let model: string = medium ? 'nai-diffusion-5-full-medium' : draft.model;
  if (draft.action === 'infill') model = `${model}-inpainting`;
  const parameters = {
    params_version: 4, width: draft.width, height: draft.height, steps: medium ? 14 : draft.steps, scale: draft.guidance,
    ...(!medium ? { cfg_rescale: draft.rescale } : {}), seed, n_samples: draft.samples, sampler: medium ? 'k_euler_ancestral' : draft.sampler, noise_schedule: draft.noiseSchedule,
    negative_prompt: negative, qualityToggle: false, ucPreset: 3, image_format: 'png',
    tag_hint_qt: presetHint[draft.qualityPreset], tag_hint_uc_preset: presetHint[ucPreset],
    ...(v5 ? { straight_alpha: draft.straightAlpha, ...(draft.transparent ? { tag_hint_transparent_background: true } : {}) } : {}),
    ...((medium || draft.sampler === 'k_euler_ancestral') && draft.noiseSchedule !== 'native' ? { deliberate_euler_ancestral_bug: false, prefer_brownian: true } : {}),
    v4_prompt: captions(false), v4_negative_prompt: captions(true),
    ...(draft.action !== 'generate' ? { image: media!.image, strength: draft.strength, noise: draft.noise, extra_noise_seed: snapshot.extraNoiseSeed, color_correct: false } : {}),
    ...(draft.enhance ? {upscaled_enhance:true} : {}),
    ...(draft.action === 'infill' ? { mask: media!.mask, add_original_image: draft.addOriginalImage, ...(draft.inpaintStrength !== 1 ? { img2img: { strength: draft.inpaintStrength, color_correct: true } } : {}) } : {}),
  };
  const requestJson = JSON.stringify({ input: prompt, model, action: draft.action, parameters });
  return { snapshot, requestJson, requestHash: CryptoJS.SHA256(requestJson).toString(), capabilitiesVersion: NOVELAI_CAPABILITIES_VERSION };
}

export function parseNovelAiResponse(raw: string, upscale=false) {
  if (raw.length > NOVELAI_MAX_RESPONSE) throw new Error('NOVELAI_RESPONSE_TOO_LARGE');
  const parsed = z.object({ images: z.array(z.object({ image: z.string().min(1).max(upscale?44*1024*1024:16 * 1024 * 1024), index: z.number().int().min(0).max(upscale?0:3), seed: z.number().int().min(0).max(4294967295).optional() })).min(1).max(upscale?1:4) }).parse(JSON.parse(raw));
  const indexes = new Set<number>();
  return parsed.images.map(image => {
    if ((!upscale && image.seed===undefined) || indexes.has(image.index) || !isImageBase64(image.image)) throw new Error('NOVELAI_IMAGE_INVALID');
    indexes.add(image.index);
    const bytes = Buffer.from(image.image, 'base64');
    // Hermes may return a plain Uint8Array from Buffer.subarray; decode on Buffer itself.
    if (bytes.length < 33 || bytes.toString('hex',0,8) !== '89504e470d0a1a0a' || bytes.toString('ascii',12,16) !== 'IHDR') throw new Error('NOVELAI_IMAGE_INVALID');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width * height > (upscale?12582912:NOVELAI_MAX_PIXELS) || bytes.length > (upscale?20:12) * 1024 * 1024) throw new Error('NOVELAI_IMAGE_TOO_LARGE');
    return { ...image, width, height, mime: 'image/png' as const };
  }).sort((a,b) => a.index - b.index);
}
