export type ArtifactErrorCode =
  | 'ARTIFACT_POLICY_MISSING'
  | 'ARTIFACT_URL_INVALID'
  | 'ARTIFACT_HTTPS_REQUIRED'
  | 'ARTIFACT_URL_CREDENTIALS'
  | 'ARTIFACT_PRIVATE_NETWORK'
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

export function artifactError(cause: unknown): ArtifactOperationError {
  if (cause instanceof ArtifactOperationError) return cause;
  if (cause && typeof cause === 'object') {
    const candidate = cause as { code?: unknown; message?: unknown; retryable?: unknown };
    if (typeof candidate.code === 'string' && candidate.code.startsWith('ARTIFACT_') && typeof candidate.retryable === 'boolean') {
      return new ArtifactOperationError(
        candidate.code as ArtifactErrorCode,
        typeof candidate.message === 'string' ? candidate.message : 'Artifact transfer failed.',
        candidate.retryable,
      );
    }
  }
  return new ArtifactOperationError('ARTIFACT_NETWORK', 'Artifact transfer failed.', true, { cause });
}
