import type { HttpTransport } from '../../../providers/httpTransport';
import { buildAutodlSubmitRequest, type AutodlInput } from './mapping';
import { H3_WORKFLOW_ID } from './metadata';

export { H3_WORKFLOW_ID } from './metadata';

const BASE_URL = 'https://autodl.art/api/v1/comfyui/comfyui_workflow/';

export type ProviderErrorKind = 'network' | 'timeout' | 'auth' | 'http' | 'provider' | 'response';
export type AutodlResponseData = { task_id?: string; status?: unknown; results?: unknown; created_at?: unknown; started_at?: unknown; duration?: unknown };

export class ProviderError extends Error {
  constructor(
    public readonly provider: 'autodl',
    public readonly operation: 'submit' | 'status',
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

function networkMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/UnknownHostException|Unable to resolve host|No address associated with hostname/i.test(detail)) {
    return `AutoDL 域名解析失败，请检查当前设备的 DNS 与网络连接。原始错误：${detail}`;
  }
  return `AutoDL 网络请求失败：${detail}`;
}

export function createAutodlClient({ transport, token, baseUrl = BASE_URL, timeoutMs = 30_000 }: { transport: HttpTransport; token: string; baseUrl?: string; timeoutMs?: number }) {
  const root = `${baseUrl.replace(/\/+$/, '')}/`;
  async function request(operation: 'submit' | 'status', url: string, init: RequestInit): Promise<AutodlResponseData> {
    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await transport(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new ProviderError('autodl', operation, 'timeout', 'AutoDL 请求超时，请稍后重试。', undefined, { cause: error });
      throw new ProviderError('autodl', operation, 'network', networkMessage(error), undefined, { cause: error });
    } finally {
      clearTimeout(timer);
    }
    let body: { code?: unknown; msg?: string; data?: AutodlResponseData; error?: { message?: unknown } };
    try {
      body = await response.json() as typeof body;
    } catch (error) {
      throw new ProviderError('autodl', operation, 'response', `AutoDL 返回了无法解析的响应（HTTP ${response.status}）`, response.status, { cause: error });
    }
    const message = typeof body.error?.message === 'string' ? body.error.message : body.msg;
    if (!response.ok) throw new ProviderError('autodl', operation, response.status === 401 || response.status === 403 ? 'auth' : 'http', message || `AutoDL 请求失败（HTTP ${response.status}）`, response.status);
    if (String(body.code).toLowerCase() !== 'success') throw new ProviderError('autodl', operation, 'provider', message || 'AutoDL 拒绝了请求', response.status);
    if (!body.data || typeof body.data !== 'object') throw new ProviderError('autodl', operation, 'response', 'AutoDL 响应缺少 data', response.status);
    return body.data;
  }
  return {
    submit(input: AutodlInput, workflowId = H3_WORKFLOW_ID) {
      if (!/^[A-Za-z0-9_.-]+$/.test(workflowId)) throw new ProviderError('autodl', 'submit', 'provider', 'AutoDL workflow ID 无效');
      return request('submit', root + encodeURIComponent(workflowId), { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(buildAutodlSubmitRequest(input)) });
    },
    getStatus(providerJobId: string) {
      return request('status', root + 'result/' + encodeURIComponent(providerJobId), { headers: { Authorization: token } });
    },
  };
}
