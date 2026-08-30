import { normalizeAutodlStatus, parseAutodlResult, type AutodlInput } from '../../providers/autodl/mapping';
import { autodlComfyUiManifest } from './manifest';
import type { ArtifactRecord } from '../../../jobs/types';
import { createAutodlClient } from '../../providers/autodl/client';
import type { HttpTransport } from '../../../providers/httpTransport';
type Handle = { providerJobId: string };
export function createAutodlComfyUiAdapter(deps: { transport: HttpTransport; token: string }) {
  const client = createAutodlClient(deps);
  return {
    manifest: () => autodlComfyUiManifest,
    async validateCredentials() { return { ok: Boolean(deps.token.trim()) }; },
    async submit(input: AutodlInput): Promise<Handle> { const data = await client.submit(input); if (!data.task_id) throw new Error('AutoDL 未返回任务 ID'); return { providerJobId: String(data.task_id) }; },
    async getStatus(handle: Handle): Promise<{ status: ReturnType<typeof normalizeAutodlStatus>; artifacts: ArtifactRecord[]; rawStatus?: string }> { const data = await client.getStatus(handle.providerJobId); return { status: normalizeAutodlStatus(data.status), artifacts: parseAutodlResult({ results: data.results }), rawStatus: String(data.status ?? '') }; },
  };
}
