import type { TaskMediaInput } from '../../../tasks/types';
import type { ArtifactRecord } from '../../../jobs/types';

export type AutodlInput = { prompt: string; resolution: string; duration: number; seed?: string; images?: TaskMediaInput[]; audios?: TaskMediaInput[] };
export function buildAutodlSubmitRequest(input: AutodlInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt, duration: input.duration, resolution: input.resolution };
  if (input.seed?.trim()) payload.seed = Number(input.seed) || input.seed.trim();
  input.images?.slice(0, 9).forEach((item, index) => { if (item.dataUri) payload[`ref_image_${index + 1}`] = item.dataUri; });
  input.audios?.slice(0, 3).forEach((item, index) => { if (item.dataUri) payload[`ref_audio_${index + 1}`] = item.dataUri; });
  return payload;
}
export function normalizeAutodlStatus(value: unknown): 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' { const s = String(value || 'QUEUED').toUpperCase(); if (s === 'SUCCESSFUL' || s === 'SUCCESS') return 'SUCCEEDED'; if (s === 'EXECUTING' || s === 'PROCESSING' || s === 'RUNNING') return 'RUNNING'; if (s === 'FAILED') return 'FAILED'; if (s === 'CANCELLED') return 'CANCELLED'; return 'QUEUED'; }
function findUrl(value: unknown): string { if (typeof value === 'string' && /^https?:\/\//.test(value)) return value; if (Array.isArray(value)) for (const item of value) { const result = findUrl(item); if (result) return result; } else if (value && typeof value === 'object') for (const item of Object.values(value)) { const result = findUrl(item); if (result) return result; } return ''; }
export function parseAutodlResult(data: unknown): ArtifactRecord[] { const uri = findUrl(data); return uri ? [{ id: `artifact:${uri}`, jobId: '', kind: 'video', uri, mime: 'video/mp4' }] : []; }
