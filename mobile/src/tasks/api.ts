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
  return { ...input, id: String(data.task_id), status: normalize(data.status), createdAt: now, updatedAt: now };
}

export async function getTask(token: string, task: TaskRecord): Promise<TaskRecord> {
  const response = await fetch(API_ROOT + 'result/' + encodeURIComponent(task.id), { headers: { Authorization: token } });
  const data = await parse(response);
  const url = findVideoUrl(data?.results);
  return { ...task, status: normalize(data?.status ?? task.status), videoUrl: url || task.videoUrl, updatedAt: Date.now() };
}

function normalize(value: unknown): TaskStatus { const s = String(value || 'QUEUED').toUpperCase(); if (s === 'SUCCESSFUL') return 'SUCCESS'; if (s === 'PENDING') return 'QUEUED'; if (s === 'EXECUTING' || s === 'PROCESSING') return 'RUNNING'; if (s === 'FAILED' || s === 'CANCELLED') return s; return s === 'SUCCESS' ? 'SUCCESS' : 'QUEUED'; }
function findVideoUrl(results: unknown): string { if (!Array.isArray(results)) return ''; for (const item of results) { if (typeof item === 'string' && /\.mp4(?:\?|$)/i.test(item)) return item; if (item && typeof item === 'object') { const value = Object.values(item as Record<string, unknown>).find((v) => typeof v === 'string' && /^https?:\/\//.test(v) && /\.mp4(?:\?|$)/i.test(v)); if (typeof value === 'string') return value; } } return ''; }
