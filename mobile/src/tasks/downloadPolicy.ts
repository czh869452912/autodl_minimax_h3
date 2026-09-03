import { assertSafeHttpsUrl } from '../security/urlPolicy';
import { fetch as expoFetch } from 'expo/fetch';

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
  const accepted = options.acceptedMimes ?? ['video/mp4'];
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
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  /** @deprecated Use connectTimeoutMs and idleTimeoutMs. */
  timeoutMs?: number;
  maxHops?: number;
  fetcher?: typeof fetch;
  writer: (chunk: Uint8Array, append: boolean) => Promise<void>;
};

export type ArtifactDownloadResult = { finalUrl: string; status: number; mime: string; size: number };
export type OpenArtifactDownloadResult = {
  finalUrl: string;
  status: number;
  mime: string;
  declaredSize?: number;
  stream: AsyncIterable<Uint8Array>;
};

function responseHeader(response: Response, name: string): string | undefined {
  return response.headers.get(name) ?? undefined;
}

async function discardResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function declaredBodyLength(response: Response): number | undefined {
  const encoding = responseHeader(response, 'content-encoding')?.trim().toLowerCase();
  if (encoding && encoding !== 'identity') return undefined;
  const raw = responseHeader(response, 'content-length');
  if (!raw || !/^\d+$/.test(raw.trim())) return undefined;
  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : undefined;
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

export async function openArtifactDownload(initialUrl: string, options: Omit<ArtifactDownloadOptions, 'writer'>): Promise<OpenArtifactDownloadResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES;
  const acceptedMimes = options.acceptedMimes ?? ['video/mp4'];
  const connectTimeoutMs = options.connectTimeoutMs ?? options.timeoutMs ?? 30_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? options.timeoutMs ?? 30_000;
  const fetcher = options.fetcher ?? (expoFetch as typeof fetch);
  const maxHops = options.maxHops ?? 3;
  let current = validateRedirectUrl(initialUrl, options.allowedHosts, options.allowProviderSuppliedPublicHosts);
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const controller = new AbortController();
    let response: Response;
    try {
      response = await readWithTimeout(
        fetcher(current, { method: 'GET', redirect: 'manual', signal: controller.signal }),
        connectTimeoutMs,
        () => controller.abort(),
      );
    } catch (error) {
      if (controller.signal.aborted) throw new Error('下载连接超时', { cause: error });
      throw error;
    }
      if (response.status >= 300 && response.status < 400) {
        const location = responseHeader(response, 'location');
        await discardResponseBody(response);
        if (hop === maxHops) throw new Error('下载重定向次数超过限制');
        if (!location) throw new Error('下载重定向缺少目标地址');
        current = validateRedirectUrl(new URL(location, current).toString(), options.allowedHosts, options.allowProviderSuppliedPublicHosts);
        continue;
      }
      if (!response.ok) { await discardResponseBody(response); throw new Error(`下载失败（HTTP ${response.status}）`); }
      const responseMime = responseHeader(response, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
      const mime = responseMime;
      if (!mime || !acceptedMimes.includes(mime)) { await discardResponseBody(response); throw new Error(`下载媒体类型不受支持：${mime ?? 'unknown'}`); }
      const expectedLength = declaredBodyLength(response);
      if (expectedLength != null && expectedLength > maxBytes) { await discardResponseBody(response); throw new Error('下载文件大小超过限制'); }
      let consumed = false;
      const stream: AsyncIterable<Uint8Array> = {
        async *[Symbol.asyncIterator]() {
          if (consumed) throw new Error('下载响应流已被读取');
          consumed = true;
          const reader = response.body?.getReader();
          let size = 0;
          if (reader) {
            while (true) {
              let part: ReadableStreamReadResult<Uint8Array>;
              try {
                part = await readWithTimeout(reader.read(), idleTimeoutMs, () => { controller.abort(); void reader.cancel().catch(() => undefined); });
              } catch (error) {
                if (controller.signal.aborted) throw new Error('下载读取空闲超时', { cause: error });
                throw error;
              }
              if (part.done) break;
              if (size + part.value.byteLength > maxBytes) { await reader.cancel().catch(() => undefined); throw new Error('下载文件大小超过限制'); }
              size += part.value.byteLength;
              yield part.value;
            }
          } else {
            const bytes = new Uint8Array(await readWithTimeout(response.arrayBuffer(), idleTimeoutMs, () => controller.abort()));
            if (bytes.byteLength > maxBytes) throw new Error('下载文件大小超过限制');
            size = bytes.byteLength;
            yield bytes;
          }
          if (size <= 0 || (expectedLength != null && size !== expectedLength)) throw new Error('下载文件不完整');
        },
      };
      return { finalUrl: current, status: response.status, mime, declaredSize: expectedLength, stream };
  }
  throw new Error('下载重定向次数超过限制');
}

export async function downloadArtifact(initialUrl: string, options: ArtifactDownloadOptions): Promise<ArtifactDownloadResult> {
  const opened = await openArtifactDownload(initialUrl, options);
  let size = 0;
  for await (const chunk of opened.stream) {
    await options.writer(chunk, size > 0);
    size += chunk.byteLength;
  }
  return { finalUrl: opened.finalUrl, status: opened.status, mime: opened.mime, size };
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
      await discardResponseBody(response);
      if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
      return current;
    }
    const location = response.headers.get('location');
    await discardResponseBody(response);
    if (hop === maxHops) throw new Error('下载重定向次数超过限制');
    if (!location) throw new Error('下载重定向缺少目标地址');
    current = validateRedirectUrl(new URL(location, current).toString(), options.allowedHosts, options.allowProviderSuppliedPublicHosts);
  }
  throw new Error('下载重定向次数超过限制');
}
