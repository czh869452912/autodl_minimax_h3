import type { ArtifactDownloadPolicy } from '../schema/types';

export const DEFAULT_ARTIFACT_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_ARTIFACT_TIMEOUT_MS = 30_000;

export function normalizeArtifactDownloadPolicy(policy: ArtifactDownloadPolicy = {}) {
  const normalized = {
    allowedHosts: [...(policy.allowedHosts ?? [])],
    allowProviderSuppliedPublicHosts: policy.allowProviderSuppliedPublicHosts ?? false,
    acceptedMimes: [...(policy.acceptedMimes ?? ['video/mp4'])],
    maxBytes: policy.maxBytes ?? DEFAULT_ARTIFACT_DOWNLOAD_BYTES,
    connectTimeoutMs: policy.connectTimeoutMs ?? policy.timeoutMs ?? DEFAULT_ARTIFACT_TIMEOUT_MS,
    idleTimeoutMs: policy.idleTimeoutMs ?? policy.timeoutMs ?? DEFAULT_ARTIFACT_TIMEOUT_MS,
  };
  if ([normalized.maxBytes, normalized.connectTimeoutMs, normalized.idleTimeoutMs].some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw Object.assign(new Error('Invalid artifact download limits.'), { code: 'ARTIFACT_INPUT_INVALID' });
  }
  return normalized;
}
