import type { TaskRecord, TaskStatus, TaskMediaInput } from './types';

const API_ROOT = 'https://autodl.art/api/v1/comfyui/comfyui_workflow/';
const WORKFLOW_ID = 'minimax_h3_image_audio_to_video_v2_15s';

async function parse(response: Response) {
  const body = await response.json() as any;
  if (!response.ok || String(body.code).toLowerCase() !== 'success') throw new Error(body.msg || `请求失败（${response.status}）`);
  return body.data;
}

type SubmitInput = Pick<TaskRecord, 'prompt' | 'duration' | 'resolution'> & { seed?: string; images?: TaskMediaInput[]; audios?: TaskMediaInput[] };
export function buildTaskPayload(input: SubmitInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { prompt: input.prompt, duration: input.duration, resolution: input.resolution };
  if (input.seed?.trim()) payload.seed = Number(input.seed) || input.seed.trim();
  input.images?.slice(0, 9).forEach((item, index) => { if (item.dataUri) payload[`ref_image_${index + 1}`] = item.dataUri; });
  input.audios?.slice(0, 3).forEach((item, index) => { if (item.dataUri) payload[`ref_audio_${index + 1}`] = item.dataUri; });
  return payload;
}
export async function submitTask(token: string, input: SubmitInput): Promise<TaskRecord> {
  const response = await fetch(API_ROOT + WORKFLOW_ID, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(buildTaskPayload(input)) });
  const data = await parse(response);
  const now = Date.now();
  return { ...input, id: String(data.task_id), status: normalize(data.status), createdAt: parseProviderTimestamp(data.created_at) ?? now, updatedAt: now };
}

export async function getTask(token: string, task: TaskRecord): Promise<TaskRecord> {
  const response = await fetch(API_ROOT + 'result/' + encodeURIComponent(task.id), { headers: { Authorization: token } });
  const data = await parse(response);
  const url = findVideoUrl(data?.results);
  const createdAt = parseProviderTimestamp(data?.created_at) ?? task.createdAt;
  const startedAt = parseProviderTimestamp(data?.started_at) ?? task.startedAt;
  const executionDuration = toSeconds(data?.duration) ?? task.executionDuration;
  return { ...task, status: normalize(data?.status ?? task.status), videoUrl: url || task.videoUrl, createdAt, startedAt, executionDuration, updatedAt: Date.now() };
}

function normalize(value: unknown): TaskStatus { const s = String(value || 'QUEUED').toUpperCase(); if (s === 'SUCCESSFUL') return 'SUCCESS'; if (s === 'PENDING') return 'QUEUED'; if (s === 'EXECUTING' || s === 'PROCESSING') return 'RUNNING'; if (s === 'RUNNING') return 'RUNNING'; if (s === 'FAILED' || s === 'CANCELLED') return s; return s === 'SUCCESS' ? 'SUCCESS' : 'QUEUED'; }
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
function findVideoUrl(results: unknown): string {
  if (!Array.isArray(results)) return '';
  for (const item of results) {
    if (typeof item === 'string' && /^https?:\/\//.test(item)) return item;
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const direct = record.url ?? record.video_url ?? record.videoUrl ?? record.output;
    if (typeof direct === 'string' && /^https?:\/\//.test(direct)) return direct;
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        const nested = findVideoUrl(Array.isArray(value) ? value : [value]);
        if (nested) return nested;
      }
    }
  }
  return '';
}
