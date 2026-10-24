import { createAutodlClient } from './client';
import { normalizeAutodlStatus, parseAutodlDuration, parseAutodlResult, parseAutodlTimestamp, type AutodlInput } from './mapping';
import { autodlComfyUiManifest } from './manifest';
import type { ArtifactRecord } from '../../../jobs/types';
import type { HttpTransport } from '../../../providers/httpTransport';
import { prepareAutodlInput } from './prepareInputs';
import type { ProviderHandle } from '../../executor/types';
import { ProviderError } from './client';
import {ProviderPreflightError} from '../errors';

type Handle = { providerJobId: string };
export function createAutodlComfyUiAdapter(deps: { transport: HttpTransport; token: string; readBase64?: (uri: string) => Promise<string> }) {
  const client = createAutodlClient(deps);
  const prepareInput=async(input:AutodlInput,target:{operation?:string;workflowId?:string}={})=>{
    if(target.operation && target.operation!=='workflow.submit')throw new ProviderPreflightError('LOCAL_OPERATION_INVALID',`不支持的 AutoDL 操作：${target.operation}`);
    if(target.workflowId!==undefined && !/^[A-Za-z0-9_.-]+$/.test(target.workflowId))throw new ProviderPreflightError('LOCAL_WORKFLOW_INVALID','AutoDL workflow ID 无效');
    try{return await prepareAutodlInput(input,{readBase64:deps.readBase64});}catch(error){throw new ProviderPreflightError('LOCAL_INPUT_UNAVAILABLE',error instanceof Error?error.message:'参考素材读取失败');}
  };
  return {
    manifest: () => autodlComfyUiManifest,
    prepareInput,
    async validateCredentials() { return { ok: Boolean(deps.token.trim()) }; },
    async submit(input: AutodlInput, target: { operation?: string; workflowId?: string } = {}): Promise<Handle> { const prepared = await prepareInput(input,target); const data = await client.submit(prepared, target.workflowId); if (!data.task_id) throw new Error('AutoDL 未返回任务 ID'); return { providerJobId: String(data.task_id) }; },
    async getStatus(handle: ProviderHandle): Promise<{ status: ReturnType<typeof normalizeAutodlStatus>; artifacts: ArtifactRecord[]; rawStatus?: string; startedAt?: number; executionDuration?: number }> { const providerJobId = handle.providerJobId; if (typeof providerJobId !== 'string' || !providerJobId.trim()) throw new ProviderError('autodl', 'status', 'response', 'AutoDL 任务句柄无效'); const data = await client.getStatus(providerJobId); return { status: normalizeAutodlStatus(data.status), artifacts: parseAutodlResult({ results: data.results }), rawStatus: String(data.status ?? ''), startedAt: parseAutodlTimestamp(data.started_at), executionDuration: parseAutodlDuration(data.duration) }; },
  };
}
