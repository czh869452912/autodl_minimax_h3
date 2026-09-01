import { createAutodlClient } from './client';
import { normalizeAutodlStatus, parseAutodlDuration, parseAutodlResult, parseAutodlTimestamp, type AutodlInput } from './mapping';
import { autodlComfyUiManifest } from './manifest';
import type { ArtifactRecord } from '../../../jobs/types';
import type { HttpTransport } from '../../../providers/httpTransport';
import { prepareAutodlInput } from './prepareInputs';

type Handle = { providerJobId: string };
export function createAutodlComfyUiAdapter(deps: { transport: HttpTransport; token: string; readBase64?: (uri: string) => Promise<string> }) {
  const client = createAutodlClient(deps);
  return {
    manifest: () => autodlComfyUiManifest,
    async validateCredentials() { return { ok: Boolean(deps.token.trim()) }; },
    async submit(input: AutodlInput, target: { operation?: string; workflowId?: string } = {}): Promise<Handle> { if (target.operation && target.operation !== 'workflow.submit') throw new Error(`不支持的 AutoDL 操作：${target.operation}`); const prepared = await prepareAutodlInput(input, { readBase64: deps.readBase64 }); const data = await client.submit(prepared, target.workflowId); if (!data.task_id) throw new Error('AutoDL 未返回任务 ID'); return { providerJobId: String(data.task_id) }; },
    async getStatus(handle: Handle): Promise<{ status: ReturnType<typeof normalizeAutodlStatus>; artifacts: ArtifactRecord[]; rawStatus?: string; startedAt?: number; executionDuration?: number }> { const data = await client.getStatus(handle.providerJobId); return { status: normalizeAutodlStatus(data.status), artifacts: parseAutodlResult({ results: data.results }), rawStatus: String(data.status ?? ''), startedAt: parseAutodlTimestamp(data.started_at), executionDuration: parseAutodlDuration(data.duration) }; },
  };
}
