import type { NovelAiDraftInput } from './novelAiProtocol';

export type EnhanceScale = '1' | '1.5' | '2' | 'max';
export type Enhancement = { scale: EnhanceScale; sourceWidth: number; sourceHeight: number };
const maxPixels = 3145728;
export const ENHANCE_MAGNITUDES = [
  { strength: 0.2, noise: 0 }, { strength: 0.4, noise: 0 }, { strength: 0.5, noise: 0 },
  { strength: 0.6, noise: 0 }, { strength: 0.7, noise: 0.1 },
] as const;
const snap = (n: number) => Math.max(64, Math.round(n / 64) * 64);

/** Matches NovelAI public client 32f2478, including its portrait/landscape exception. */
export function enhanceScales(width: number, height: number, model: string): EnhanceScale[] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 64 || height < 64 || width * height > maxPixels) return [];
  const standard = width === 832 && height === 1216 || width === 1216 && height === 832;
  const numeric: EnhanceScale[] = standard ? ['1', '1.5'] : ([1, 1.5, 2] as const)
    .filter(scale => width * height * scale * scale <= maxPixels && width * scale % 64 === 0 && height * scale % 64 === 0)
    .map(scale => String(scale) as EnhanceScale);
  if (model.startsWith('nai-diffusion-5') && width * height < 2516582.4) numeric.push('max');
  return numeric.filter(scale => {
    const size = enhanceRequestSize({ scale, sourceWidth: width, sourceHeight: height });
    return size.width * size.height <= maxPixels;
  });
}
export function enhanceRequestSize(value: Enhancement) {
  const factor = value.scale === 'max' ? 1 : Number(value.scale);
  return { width: snap(Math.floor(value.sourceWidth * factor)), height: snap(Math.floor(value.sourceHeight * factor)) };
}
export function enhanceOutputSize(value: Enhancement) {
  if (value.scale !== 'max') return enhanceRequestSize(value);
  const factor = Math.min(2, Math.sqrt(maxPixels / (value.sourceWidth * value.sourceHeight)));
  return { width: Math.floor(value.sourceWidth * factor), height: Math.floor(value.sourceHeight * factor) };
}
export function enhancementPatch(enhancement: Enhancement): Partial<NovelAiDraftInput> {
  return { enhancement, ...enhanceRequestSize(enhancement), enhance: enhancement.scale === 'max', samples: 1 };
}
export function createEnhanceInput(input: NovelAiDraftInput, versionId: string, width: number, height: number): NovelAiDraftInput {
  const scales = enhanceScales(width, height, input.model);
  if (!scales.length) throw new Error('这张图片没有可用的 Enhance 倍率，请使用独立超分或选择其他图片');
  return { ...input, ...enhancementPatch({ scale: scales.at(-1)!, sourceWidth: width, sourceHeight: height }),
    action: 'img2img', sourceVersionId: versionId, maskVersionId: null, maskStrokes: [],
    ...ENHANCE_MAGNITUDES[2], seed: null, extraNoiseSeed: null };
}
