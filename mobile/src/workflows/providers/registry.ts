import type { ArtifactRecord } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import { getNativeHttpTransport } from '../../providers/httpTransport';
import type { HttpTransport } from '../../providers/httpTransport';
import { createAutodlComfyUiAdapter } from './autodl/adapter';
import { autodlComfyUiManifest } from './autodl/manifest';

export type ProviderAdapter = {
  manifest(): PlatformAdapterManifest;
  validateCredentials(): Promise<{ ok: boolean }>;
  submit(input: Record<string, unknown>, target?: { operation?: string; workflowId?: string }): Promise<{ providerJobId: string }>;
  getStatus(handle: { providerJobId: string }): Promise<{ status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL_SUCCEEDED' | 'FAILED' | 'CANCELLED'; artifacts: ArtifactRecord[]; rawStatus?: string; startedAt?: number; executionDuration?: number }>;
};

const builtinManifests = [autodlComfyUiManifest];

export function getBuiltinArtifactDownloadPolicy(adapterId?: string) {
  return builtinManifests.find((manifest) => manifest.id === adapterId)?.artifactDownloadPolicy;
}

export function createBuiltinProviderAdapters({ resolveCredential, transport = getNativeHttpTransport(), additional = [] }: { resolveCredential: (kind: string) => string | undefined; transport?: HttpTransport; additional?: ProviderAdapter[] }): Map<string, ProviderAdapter> {
  const builtins: ProviderAdapter[] = [createAutodlComfyUiAdapter({ token: resolveCredential('autodl-token') ?? '', transport }), ...additional];
  return new Map(builtins.map((adapter) => [adapter.manifest().id, adapter]));
}
