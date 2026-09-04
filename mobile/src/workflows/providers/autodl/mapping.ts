import type { TaskMediaInput } from '../../../tasks/types';
import type { ArtifactRecord } from '../../../jobs/types';

export type AutodlInput = { prompt: string; resolution: string; duration: number; seed?: number | string; images?: TaskMediaInput[]; audios?: TaskMediaInput[] };
export function buildAutodlSubmitRequest(input: AutodlInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt, duration: input.duration, resolution: input.resolution };
  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) payload.seed = input.seed;
  else if (typeof input.seed === 'string' && input.seed.trim()) payload.seed = Number(input.seed) || input.seed.trim();
  input.images?.slice(0, 9).forEach((item, index) => { if (item.dataUri) payload[`ref_image_${index}`] = item.dataUri; });
  input.audios?.slice(0, 3).forEach((item, index) => { if (item.dataUri) payload[`ref_audio_${index}`] = item.dataUri; });
  return payload;
}
export function normalizeAutodlStatus(value: unknown): 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL_SUCCEEDED' | 'FAILED' | 'CANCELLED' {
  const status = String(value || 'QUEUED').trim().toUpperCase();
  if (status === 'SUCCESSFUL' || status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED' || status === 'COMPLETE') return 'SUCCEEDED';
  if (status === 'PARTIAL' || status === 'PARTIAL_SUCCESS' || status === 'PARTIAL_SUCCESSFUL' || status === 'PARTIAL_SUCCEEDED' || status === 'PARTIALLY_SUCCEEDED' || status === 'PARTIALLY_COMPLETE' || status === 'COMPLETED_WITH_ERRORS') return 'PARTIAL_SUCCEEDED';
  if (status === 'EXECUTING' || status === 'PROCESSING' || status === 'RUNNING') return 'RUNNING';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'CANCELLED' || status === 'CANCELED') return 'CANCELLED';
  return 'QUEUED';
}
export function parseAutodlTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed);
  const parsed = zoned ? Date.parse(trimmed) : Date.parse(trimmed.replace(' ', 'T') + '+08:00');
  return Number.isFinite(parsed) ? parsed : undefined;
}
export function parseAutodlDuration(value: unknown): number | undefined { const duration = Number(value); return Number.isFinite(duration) && duration >= 0 ? duration : undefined; }

type ObjectValue = Record<string, unknown>;
type UrlCandidate = { uri: string; key?: string; contexts: ObjectValue[] };

const providerIdKeys = ['artifact_id', 'artifactId', 'result_id', 'resultId', 'file_id', 'fileId', 'id', 'uuid'] as const;
const mimeKeys = ['mime', 'mime_type', 'mimeType', 'content_type', 'contentType'] as const;
const kindKeys = ['kind', 'type', 'media_type', 'mediaType', 'artifact_type', 'artifactType'] as const;

const extensionInfo: Record<string, { kind: ArtifactRecord['kind']; mime: string }> = {
  jpg: { kind: 'image', mime: 'image/jpeg' }, jpeg: { kind: 'image', mime: 'image/jpeg' }, png: { kind: 'image', mime: 'image/png' },
  gif: { kind: 'image', mime: 'image/gif' }, webp: { kind: 'image', mime: 'image/webp' }, bmp: { kind: 'image', mime: 'image/bmp' },
  svg: { kind: 'image', mime: 'image/svg+xml' }, avif: { kind: 'image', mime: 'image/avif' }, heic: { kind: 'image', mime: 'image/heic' },
  mp4: { kind: 'video', mime: 'video/mp4' }, mov: { kind: 'video', mime: 'video/quicktime' }, webm: { kind: 'video', mime: 'video/webm' },
  mkv: { kind: 'video', mime: 'video/x-matroska' }, avi: { kind: 'video', mime: 'video/x-msvideo' }, m4v: { kind: 'video', mime: 'video/x-m4v' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' }, wav: { kind: 'audio', mime: 'audio/wav' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' }, ogg: { kind: 'audio', mime: 'audio/ogg' }, flac: { kind: 'audio', mime: 'audio/flac' }, opus: { kind: 'audio', mime: 'audio/opus' },
  txt: { kind: 'text', mime: 'text/plain' }, md: { kind: 'text', mime: 'text/markdown' }, csv: { kind: 'text', mime: 'text/csv' },
  html: { kind: 'text', mime: 'text/html' }, htm: { kind: 'text', mime: 'text/html' }, json: { kind: 'json', mime: 'application/json' },
};

function collectUrls(value: unknown, contexts: ObjectValue[] = [], key?: string, result: UrlCandidate[] = []): UrlCandidate[] {
  if (typeof value === 'string') {
    const uri = value.trim();
    try {
      const parsed = new URL(uri);
      if (parsed.protocol === 'https:' && parsed.hostname && parsed.pathname !== '') result.push({ uri, key, contexts });
    } catch {}
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, contexts, key, result));
    return result;
  }
  if (value && typeof value === 'object') {
    const object = value as ObjectValue;
    const nestedContexts = [...contexts, object];
    Object.entries(object).forEach(([childKey, child]) => collectUrls(child, nestedContexts, childKey, result));
  }
  return result;
}

function contextString(candidate: UrlCandidate, keys: readonly string[]): string | undefined {
  for (let index = candidate.contexts.length - 1; index >= 0; index -= 1) {
    for (const key of keys) {
      const value = candidate.contexts[index][key];
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
    }
  }
  return undefined;
}

function providerIdFor(candidate: UrlCandidate): string | undefined {
  const nearest = candidate.contexts[candidate.contexts.length - 1];
  if (nearest) {
    for (const key of providerIdKeys) {
      const value = nearest[key];
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
    }
  }
  return contextString(candidate, providerIdKeys.slice(0, 6));
}



function kindFromText(value?: string): ArtifactRecord['kind'] | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (/image|photo|picture|thumbnail|poster/.test(normalized)) return 'image';
  if (/video|movie|clip/.test(normalized)) return 'video';
  if (/audio|sound|voice|music/.test(normalized)) return 'audio';
  if (/json/.test(normalized)) return 'json';
  if (/text|caption|transcript|markdown/.test(normalized)) return 'text';
  if (/file|binary|document/.test(normalized)) return 'file';
  return undefined;
}

function kindFromMime(mime?: string): ArtifactRecord['kind'] | undefined {
  const normalized = mime?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized === 'application/json' || normalized.endsWith('+json')) return 'json';
  if (normalized.startsWith('text/')) return 'text';
  return 'file';
}

function extensionFor(uri: string): string | undefined {
  const path = uri.split(/[?#]/, 1)[0];
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase();
}

function describe(candidate: UrlCandidate): { kind: ArtifactRecord['kind']; mime?: string } {
  const explicitMime = contextString(candidate, mimeKeys)?.toLowerCase();
  const extension = extensionFor(candidate.uri);
  const extensionDescription = extension ? extensionInfo[extension] : undefined;
  const keyKind = candidate.key && !/^(files?|urls?|uris?|url|download_url)$/i.test(candidate.key) ? kindFromText(candidate.key) : undefined;
  const explicitKind = kindFromText(contextString(candidate, kindKeys)) ?? keyKind;
  const kind = explicitKind ?? kindFromMime(explicitMime) ?? extensionDescription?.kind ?? 'file';
  const defaultMime = kind === 'video' ? 'video/mp4' : kind === 'text' ? 'text/plain' : kind === 'json' ? 'application/json' : undefined;
  return { kind, mime: explicitMime ?? extensionDescription?.mime ?? defaultMime };
}

export function parseAutodlResult(data: unknown): ArtifactRecord[] {
  const resultPayload = data && typeof data === 'object' && !Array.isArray(data) && 'results' in data
    ? (data as ObjectValue).results
    : data;
  const candidates = collectUrls(resultPayload);
  const providerIds = candidates.map(providerIdFor);
  const providerIdCounts = new Map<string, number>();
  providerIds.forEach((id) => { if (id) providerIdCounts.set(id, (providerIdCounts.get(id) ?? 0) + 1); });
  const providerIdIndexes = new Map<string, number>();
  const usedIds = new Set<string>();

  return candidates.map((candidate, index) => {
    const providerId = providerIds[index];
    const duplicateIndex = providerId ? providerIdIndexes.get(providerId) ?? 0 : 0;
    if (providerId) providerIdIndexes.set(providerId, duplicateIndex + 1);
    const baseId = providerId && providerIdCounts.get(providerId) === 1 ? providerId : providerId ? `${providerId}:${duplicateIndex}` : `artifact:${index}`;
    let id = baseId;
    let collision = 1;
    while (usedIds.has(id)) id = `${baseId}:${collision++}`;
    usedIds.add(id);
    const description = describe(candidate);
    return { id, jobId: '', kind: description.kind, uri: candidate.uri, mime: description.mime, metadata: candidate.key ? { path: candidate.key } : undefined };
  });
}
