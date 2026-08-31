import type { TaskRecord, TaskStatus, TaskMediaInput } from './types';
import { getNativeHttpTransport } from '../providers/httpTransport';
import { createAutodlClient } from '../workflows/providers/autodl/client';
import { normalizeAutodlStatus, parseAutodlResult } from '../workflows/providers/autodl/mapping';

const WORKFLOW_ID = 'minimax_h3_image_audio_to_video_v2_15s';

type SubmitInput = Pick<TaskRecord, 'prompt' | 'duration' | 'resolution'> & { seed?: string; images?: TaskMediaInput[]; audios?: TaskMediaInput[] };
export function buildTaskPayload(input: SubmitInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt, duration: input.duration, resolution: input.resolution };
  if (input.seed?.trim()) payload.seed = Number(input.seed) || input.seed.trim();
  input.images?.slice(0, 9).forEach((item, index) => { if (item.dataUri) payload[`ref_image_${index + 1}`] = item.dataUri; });
  input.audios?.slice(0, 3).forEach((item, index) => { if (item.dataUri) payload[`ref_audio_${index + 1}`] = item.dataUri; });
  return payload;
}
export async function submitTask(token: string, input: SubmitInput): Promise<TaskRecord> {
  const client = createAutodlClient({ transport: getNativeHttpTransport(), token });
  const data = await client.submit(input, WORKFLOW_ID);
  const now = Date.now();
  return { ...input, id: String(data.task_id), status: normalize(data.status), createdAt: parseProviderTimestamp(data.created_at) ?? now, updatedAt: now };
}

export async function getTask(token: string, task: TaskRecord): Promise<TaskRecord> {
  const client = createAutodlClient({ transport: getNativeHttpTransport(), token });
  const data = await client.getStatus(task.id);
  const url = parseAutodlResult({ results: data?.results })[0]?.uri;
  const createdAt = parseProviderTimestamp(data?.created_at) ?? task.createdAt;
  const startedAt = parseProviderTimestamp(data?.started_at) ?? task.startedAt;
  const executionDuration = toSeconds(data?.duration) ?? task.executionDuration;
  return { ...task, status: normalize(data?.status ?? task.status), videoUrl: url || task.videoUrl, createdAt, startedAt, executionDuration, updatedAt: Date.now() };
}

function normalize(value: unknown): TaskStatus { const normalized = normalizeAutodlStatus(value); return normalized === 'SUCCEEDED' ? 'SUCCESS' : normalized === 'CANCELLED' ? 'CANCELLED' : normalized === 'FAILED' ? 'FAILED' : normalized === 'RUNNING' ? 'RUNNING' : 'QUEUED'; }
function toSeconds(value: unknown): number | undefined { const seconds = Number(value); return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined; }
function parseProviderTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed);
  if (zoned) {
    const timestamp = Date.parse(trimmed);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const timestamp = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
