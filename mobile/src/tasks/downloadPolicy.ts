import { assertSafeHttpsUrl } from '../security/urlPolicy';

export const DEFAULT_VIDEO_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function assertArtifactDownloadPolicy(allowedHosts?: string[], allowProviderSuppliedPublicHosts = false): void {
  if (!allowProviderSuppliedPublicHosts && !allowedHosts?.some((host) => host.trim().length > 0)) throw new Error('域名不在允许列表');
}

export function validateArtifactUrl(url: string, allowedHosts?: string[], allowProviderSuppliedPublicHosts = false): string {
  assertArtifactDownloadPolicy(allowedHosts, allowProviderSuppliedPublicHosts);
  return assertSafeHttpsUrl(url, allowProviderSuppliedPublicHosts ? {} : { allowedHosts });
}

function header(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export function validateDownloadResult(
  result: { status: number; headers?: Record<string, string>; size: number },
  options: { maxBytes?: number; acceptedMimes?: string[] } = {},
): void {
  const maxBytes = options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES;
  const accepted = options.acceptedMimes ?? ['video/mp4', 'video/webm', 'video/quicktime'];
  if (result.status < 200 || result.status >= 300) throw new Error(`下载失败（HTTP ${result.status}）`);
  if (!Number.isFinite(result.size) || result.size < 0 || result.size > maxBytes) throw new Error('下载文件大小超过限制');
  const mime = header(result.headers, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!mime || !accepted.includes(mime)) throw new Error(`下载媒体类型不受支持：${mime ?? 'unknown'}`);
}

export function validateRedirectUrl(url: string, allowedHosts?: string[], allowProviderSuppliedPublicHosts = false): string {
  return validateArtifactUrl(url, allowedHosts, allowProviderSuppliedPublicHosts);
}

export type ArtifactDownloadOptions = {
  allowedHosts: string[];
  allowProviderSuppliedPublicHosts?: boolean;
  maxBytes?: number;
  acceptedMimes?: string[];
  timeoutMs?: number;
  maxHops?: number;
  fetcher?: typeof fetch;
  writer: (chunk: Uint8Array, append: boolean) => Promise<void>;
};

export type ArtifactDownloadResult = { finalUrl: string; status: number; mime: string; size: number };

function responseHeader(response: Response, name: string): string | undefined {
  return response.headers.get(name) ?? undefined;
}

async function readWithTimeout<T>(read: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { onTimeout(); reject(new Error('下载超时')); }, timeoutMs); });
    return await Promise.race([read, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function downloadArtifact(initialUrl: string, options: ArtifactDownloadOptions): Promise<ArtifactDownloadResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES;
  const acceptedMimes = options.acceptedMimes ?? ['video/mp4', 'video/webm', 'video/quicktime'];
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetcher = options.fetcher ?? fetch;
  const maxHops = options.maxHops ?? 3;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let current = validateRedirectUrl(initialUrl, options.allowedHosts, options.allowProviderSuppliedPublicHosts);
  let response: Response | undefined;
  try {
    for (let hop = 0; hop <= maxHops; hop += 1) {
      response = await fetcher(current, { method: 'GET', redirect: 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        if (hop === maxHops) throw new Error('下载重定向次数超过限制');
        const location = responseHeader(response, 'location');
        if (!location) throw new Error('下载重定向缺少目标地址');
        current = validateRedirectUrl(new URL(location, current).toString(), options.allowedHosts, options.allowProviderSuppliedPublicHosts);
        continue;
      }
      if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
      const mime = responseHeader(response, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
      if (!mime || !acceptedMimes.includes(mime)) throw new Error(`下载媒体类型不受支持：${mime ?? 'unknown'}`);
      const reader = response.body?.getReader();
      let size = 0;
      if (reader) {
        while (true) {
          const part = await readWithTimeout(reader.read(), timeoutMs, () => controller.abort());
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxBytes) { await reader.cancel().catch(() => undefined); throw new Error('下载文件大小超过限制'); }
          await options.writer(part.value, size > part.value.byteLength);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        size = bytes.byteLength;
        if (size > maxBytes) throw new Error('下载文件大小超过限制');
        await options.writer(bytes, false);
      }
      return { finalUrl: current, status: response.status, mime, size };
    }
    throw new Error('下载重定向次数超过限制');
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof Error && error.message === '下载文件大小超过限制')) throw new Error('下载超时', { cause: error });
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

export async function resolveArtifactRedirects(
  initialUrl: string,
  options: { allowedHosts?: string[]; allowProviderSuppliedPublicHosts?: boolean; fetcher?: typeof fetch; maxHops?: number } = {},
): Promise<string> {
  let current = validateRedirectUrl(initialUrl, options.allowedHosts, options.allowProviderSuppliedPublicHosts);
  const fetcher = options.fetcher ?? fetch;
  const maxHops = options.maxHops ?? 3;
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const response = await fetcher(current, { method: 'GET', redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
      if (response.body) await response.body.cancel().catch(() => undefined);
      return current;
    }
    if (hop === maxHops) throw new Error('下载重定向次数超过限制');
    const location = response.headers.get('location');
    if (!location) throw new Error('下载重定向缺少目标地址');
    current = validateRedirectUrl(new URL(location, current).toString(), options.allowedHosts, options.allowProviderSuppliedPublicHosts);
  }
  throw new Error('下载重定向次数超过限制');
}
