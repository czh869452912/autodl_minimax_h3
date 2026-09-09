export type ArtifactErrorCode =
  | 'ARTIFACT_POLICY_MISSING'
  | 'ARTIFACT_URL_INVALID'
  | 'ARTIFACT_HTTPS_REQUIRED'
  | 'ARTIFACT_URL_CREDENTIALS'
  | 'ARTIFACT_PRIVATE_NETWORK'
  | 'ARTIFACT_DNS_FAILED'
  | 'ARTIFACT_VIRTUAL_DNS'
  | 'ARTIFACT_HOST_DENIED'
  | 'ARTIFACT_REDIRECT_INVALID'
  | 'ARTIFACT_REDIRECT_LIMIT'
  | 'ARTIFACT_CONNECT_TIMEOUT'
  | 'ARTIFACT_IDLE_TIMEOUT'
  | 'ARTIFACT_NETWORK'
  | 'ARTIFACT_HTTP_RETRYABLE'
  | 'ARTIFACT_HTTP_REJECTED'
  | 'ARTIFACT_MIME_REJECTED'
  | 'ARTIFACT_SIZE_REJECTED'
  | 'ARTIFACT_INTEGRITY_FAILED'
  | 'ARTIFACT_MEDIA_INVALID_RETRYABLE'
  | 'ARTIFACT_MEDIA_INVALID'
  | 'ARTIFACT_MEDIA_UNSUPPORTED'
  | 'ARTIFACT_MEDIA_DECODE_FAILED'
  | 'ARTIFACT_MEDIA_PROBE_FAILED'
  | 'ARTIFACT_CAS_BUSY'
  | 'ARTIFACT_INPUT_INVALID';

export class ArtifactOperationError extends Error {
  constructor(
    readonly code: ArtifactErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ArtifactOperationError';
  }
}

const RETRYABILITY: Record<ArtifactErrorCode, boolean> = {
  ARTIFACT_POLICY_MISSING: false, ARTIFACT_URL_INVALID: false, ARTIFACT_HTTPS_REQUIRED: false,
  ARTIFACT_URL_CREDENTIALS: false, ARTIFACT_PRIVATE_NETWORK: false, ARTIFACT_HOST_DENIED: false,
  ARTIFACT_DNS_FAILED: true, ARTIFACT_VIRTUAL_DNS: false,
  ARTIFACT_REDIRECT_INVALID: false, ARTIFACT_REDIRECT_LIMIT: false, ARTIFACT_CONNECT_TIMEOUT: true,
  ARTIFACT_IDLE_TIMEOUT: true, ARTIFACT_NETWORK: true, ARTIFACT_HTTP_RETRYABLE: true,
  ARTIFACT_HTTP_REJECTED: false, ARTIFACT_MIME_REJECTED: false, ARTIFACT_SIZE_REJECTED: false,
  ARTIFACT_INTEGRITY_FAILED: false, ARTIFACT_CAS_BUSY: true, ARTIFACT_INPUT_INVALID: false,
  ARTIFACT_MEDIA_INVALID_RETRYABLE: true, ARTIFACT_MEDIA_INVALID: false,
  ARTIFACT_MEDIA_UNSUPPORTED: false, ARTIFACT_MEDIA_DECODE_FAILED: false,
  ARTIFACT_MEDIA_PROBE_FAILED: false,
};

function knownCode(value: unknown): value is ArtifactErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RETRYABILITY, value);
}

export function artifactNetworkMessage(code: string | undefined, reason?: unknown): string | undefined {
  if (code === 'ARTIFACT_VIRTUAL_DNS') {
    return '下载域名解析到疑似 VPN Fake-IP 地址，请将下载域名设为真实 DNS 解析后重试。';
  }
  if (code === 'ARTIFACT_DNS_FAILED') {
    const safeReason = typeof reason === 'string' &&
      ['DNS_UNKNOWN_HOST', 'DNS_TIMEOUT', 'DNS_EXCEPTION', 'DNS_EMPTY'].includes(reason) ? ` (${reason})` : '';
    return `下载域名解析失败，将自动重试。${safeReason}`;
  }
  return undefined;
}

export function artifactError(cause: unknown): ArtifactOperationError {
  if (cause instanceof ArtifactOperationError) {
    return new ArtifactOperationError(cause.code, cause.message, RETRYABILITY[cause.code], { cause });
  }
  if (cause && typeof cause === 'object') {
    const candidate = cause as { code?: unknown; userInfo?: { reason?: unknown } };
    if (knownCode(candidate.code)) {
      return new ArtifactOperationError(
        candidate.code,
        artifactNetworkMessage(candidate.code, candidate.userInfo?.reason) ?? 'Artifact transfer failed.',
        RETRYABILITY[candidate.code],
      );
    }
  }
  return new ArtifactOperationError('ARTIFACT_NETWORK', 'Artifact transfer failed.', true, { cause });
}
