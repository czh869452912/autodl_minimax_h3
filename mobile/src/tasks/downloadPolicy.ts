import { assertSafeHttpsUrl, UrlPolicyError } from '../security/urlPolicy';
import { fetch as expoFetch } from 'expo/fetch';
import { ArtifactOperationError, artifactError, type ArtifactErrorCode } from '../workflows/executor/artifactErrors';

export const DEFAULT_VIDEO_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function assertArtifactDownloadPolicy(allowedHosts?: string[], allowProviderSuppliedPublicHosts = false): void {
  if (!allowProviderSuppliedPublicHosts && !allowedHosts?.some((host) => host.trim().length > 0)) {
    throw new ArtifactOperationError('ARTIFACT_POLICY_MISSING', '域名不在允许列表', false);
  }
}

export function validateArtifactUrl(url: string, allowedHosts?: string[], allowProviderSuppliedPublicHosts = false): string {
  assertArtifactDownloadPolicy(allowedHosts, allowProviderSuppliedPublicHosts);
  try {
    return assertSafeHttpsUrl(url, allowProviderSuppliedPublicHosts ? {} : { allowedHosts });
  } catch (cause) {
    if (!(cause instanceof UrlPolicyError)) throw cause;
    const codes: Record<UrlPolicyError['code'], ArtifactErrorCode> = {
      URL_INVALID: 'ARTIFACT_URL_INVALID', HTTPS_REQUIRED: 'ARTIFACT_HTTPS_REQUIRED',
      URL_CREDENTIALS: 'ARTIFACT_URL_CREDENTIALS', PRIVATE_NETWORK: 'ARTIFACT_PRIVATE_NETWORK',
      HOST_DENIED: 'ARTIFACT_HOST_DENIED',
    };
    throw new ArtifactOperationError(codes[cause.code], cause.message, false, { cause });
  }
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
  if (result.status < 200 || result.status >= 300) {
    const retryable = result.status === 408 || result.status === 429 || result.status >= 500;
    throw new ArtifactOperationError(retryable ? 'ARTIFACT_HTTP_RETRYABLE' : 'ARTIFACT_HTTP_REJECTED', `下载失败（HTTP ${result.status}）`, retryable);
  }
  if (!Number.isFinite(result.size) || result.size < 0 || result.size > maxBytes) throw new ArtifactOperationError('ARTIFACT_SIZE_REJECTED', '下载文件大小超过限制', false);
  const mime = header(result.headers, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!mime || !accepted.includes(mime)) throw new ArtifactOperationError('ARTIFACT_MIME_REJECTED', `下载媒体类型不受支持：${mime ?? 'unknown'}`, false);
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

async function readWithTimeout<T>(read: Promise<T>, timeoutMs: number, onTimeout: () => void, timeoutError: () => ArtifactOperationError): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { onTimeout(); reject(timeoutError()); }, timeoutMs); });
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
        () => new ArtifactOperationError('ARTIFACT_CONNECT_TIMEOUT', '下载连接超时', true),
      );
    } catch (error) {
      if (controller.signal.aborted) throw new ArtifactOperationError('ARTIFACT_CONNECT_TIMEOUT', '下载连接超时', true, { cause: error });
      throw artifactError(error);
    }
      if (response.status >= 300 && response.status < 400) {
        const location = responseHeader(response, 'location');
        await discardResponseBody(response);
        if (hop === maxHops) throw new ArtifactOperationError('ARTIFACT_REDIRECT_LIMIT', '下载重定向次数超过限制', false);
        if (!location) throw new ArtifactOperationError('ARTIFACT_REDIRECT_INVALID', '下载重定向缺少目标地址', false);
        current = validateRedirectUrl(new URL(location, current).toString(), options.allowedHosts, options.allowProviderSuppliedPublicHosts);
        continue;
      }
      if (!response.ok) {
        await discardResponseBody(response);
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new ArtifactOperationError(retryable ? 'ARTIFACT_HTTP_RETRYABLE' : 'ARTIFACT_HTTP_REJECTED', `下载失败（HTTP ${response.status}）`, retryable);
      }
      const responseMime = responseHeader(response, 'content-type')?.split(';', 1)[0].trim().toLowerCase();
      const mime = responseMime;
      if (!mime || !acceptedMimes.includes(mime)) { await discardResponseBody(response); throw new ArtifactOperationError('ARTIFACT_MIME_REJECTED', `下载媒体类型不受支持：${mime ?? 'unknown'}`, false); }
      const expectedLength = declaredBodyLength(response);
      if (expectedLength != null && expectedLength > maxBytes) { await discardResponseBody(response); throw new ArtifactOperationError('ARTIFACT_SIZE_REJECTED', '下载文件大小超过限制', false); }
      let consumed = false;
      const stream: AsyncIterable<Uint8Array> = {
        async *[Symbol.asyncIterator]() {
          if (consumed) throw new ArtifactOperationError('ARTIFACT_INTEGRITY_FAILED', '下载响应流已被读取', false);
          consumed = true;
          const reader = response.body?.getReader();
          let size = 0;
          if (reader) {
            while (true) {
              let part: ReadableStreamReadResult<Uint8Array>;
              try {
                part = await readWithTimeout(
                  reader.read(), idleTimeoutMs,
                  () => { controller.abort(); void reader.cancel().catch(() => undefined); },
                  () => new ArtifactOperationError('ARTIFACT_IDLE_TIMEOUT', '下载读取空闲超时', true),
                );
              } catch (error) {
                if (controller.signal.aborted) throw new ArtifactOperationError('ARTIFACT_IDLE_TIMEOUT', '下载读取空闲超时', true, { cause: error });
                throw artifactError(error);
              }
              if (part.done) break;
              if (size + part.value.byteLength > maxBytes) { await reader.cancel().catch(() => undefined); throw new ArtifactOperationError('ARTIFACT_SIZE_REJECTED', '下载文件大小超过限制', false); }
              size += part.value.byteLength;
              yield part.value;
            }
          } else {
            const bytes = new Uint8Array(await readWithTimeout(
              response.arrayBuffer(), idleTimeoutMs, () => controller.abort(),
              () => new ArtifactOperationError('ARTIFACT_IDLE_TIMEOUT', '下载读取空闲超时', true),
            ));
            if (bytes.byteLength > maxBytes) throw new ArtifactOperationError('ARTIFACT_SIZE_REJECTED', '下载文件大小超过限制', false);
            size = bytes.byteLength;
            yield bytes;
          }
          if (size <= 0 || (expectedLength != null && size !== expectedLength)) throw new ArtifactOperationError('ARTIFACT_INTEGRITY_FAILED', '下载文件不完整', false);
        },
      };
      return { finalUrl: current, status: response.status, mime, declaredSize: expectedLength, stream };
  }
  throw new ArtifactOperationError('ARTIFACT_REDIRECT_LIMIT', '下载重定向次数超过限制', false);
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
