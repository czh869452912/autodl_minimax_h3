import type { ArtifactRecord } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import { getNativeHttpTransport } from '../../providers/httpTransport';
import type { HttpTransport } from '../../providers/httpTransport';
import { createAutodlComfyUiAdapter } from './autodl/adapter';

export type ProviderAdapter = {
  manifest(): PlatformAdapterManifest;
  validateCredentials(): Promise<{ ok: boolean }>;
  submit(input: Record<string, unknown>): Promise<{ providerJobId: string }>;
  getStatus(handle: { providerJobId: string }): Promise<{ status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; artifacts: ArtifactRecord[]; rawStatus?: string }>;
};

export function createBuiltinProviderAdapters({ token, transport = getNativeHttpTransport(), additional = [] }: { token: string; transport?: HttpTransport; additional?: ProviderAdapter[] }): Map<string, ProviderAdapter> {
  const builtins: ProviderAdapter[] = [createAutodlComfyUiAdapter({ token, transport }), ...additional];
  return new Map(builtins.map((adapter) => [adapter.manifest().id, adapter]));
}
