import { buildAutodlSubmitRequest, normalizeAutodlStatus, parseAutodlResult, type AutodlInput } from './mapping';
import { autodlComfyUiManifest } from './manifest';
import type { ArtifactRecord } from '../../../jobs/types';
const ROOT = 'https://autodl.art/api/v1/comfyui/comfyui_workflow/';
const WORKFLOW = 'minimax_h3_image_audio_to_video_v2_15s';
type ResponseData = { task_id?: string; status?: unknown; results?: unknown; created_at?: unknown; started_at?: unknown; duration?: unknown };
type Handle = { providerJobId: string };
async function parse(response: Response): Promise<ResponseData> { const body = await response.json() as { code?: unknown; msg?: string; data?: ResponseData }; if (!response.ok || String(body.code).toLowerCase() !== 'success') throw new Error(body.msg || `请求失败（${response.status}）`); return body.data ?? {}; }
export function createAutodlComfyUiAdapter(deps: { fetch?: typeof fetch; token: string }) {
  const fetcher = deps.fetch ?? fetch;
  return {
    manifest: () => autodlComfyUiManifest,
    async validateCredentials() { return { ok: Boolean(deps.token.trim()) }; },
    async submit(input: AutodlInput): Promise<Handle> { const response = await fetcher(ROOT + WORKFLOW, { method: 'POST', headers: { Authorization: deps.token, 'Content-Type': 'application/json' }, body: JSON.stringify(buildAutodlSubmitRequest(input)) }); const data = await parse(response); if (!data.task_id) throw new Error('AutoDL 未返回任务 ID'); return { providerJobId: String(data.task_id) }; },
    async getStatus(handle: Handle): Promise<{ status: ReturnType<typeof normalizeAutodlStatus>; artifacts: ArtifactRecord[]; rawStatus?: string }> { const response = await fetcher(ROOT + 'result/' + encodeURIComponent(handle.providerJobId), { headers: { Authorization: deps.token } }); const data = await parse(response); return { status: normalizeAutodlStatus(data.status), artifacts: parseAutodlResult({ results: data.results }), rawStatus: String(data.status ?? '') }; },
  };
}
