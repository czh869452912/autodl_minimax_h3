import { assertSafeHttpsUrl } from '../security/urlPolicy';

export const DEFAULT_VIDEO_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export function validateArtifactUrl(url: string, allowedHosts?: string[]): string {
  return assertSafeHttpsUrl(url, { allowedHosts });
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
  if (mime && !accepted.includes(mime)) throw new Error(`下载媒体类型不受支持：${mime}`);
}
