import type { ArtifactRecord, JobStatus } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import type { ProviderHandle } from '../executor/types';

export type ProviderTarget = { operation?: string; workflowId?: string };
export type ProviderStatusUpdate = {
  status: JobStatus;
  artifacts: ArtifactRecord[];
  rawStatus?: string;
  startedAt?: number;
  executionDuration?: number;
};

export type ProviderAdapter = {
  manifest(): PlatformAdapterManifest;
  validateCredentials(): Promise<{ ok: boolean }>;
  prepareInput?(input:Record<string,unknown>,target?:ProviderTarget):Promise<Record<string,unknown>>;
  submit(input: Record<string, unknown>, target?: ProviderTarget): Promise<ProviderHandle>;
  getStatus(handle: ProviderHandle): Promise<ProviderStatusUpdate>;
};
