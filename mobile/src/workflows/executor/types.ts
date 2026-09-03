import type { JobRecord, NormalizedError } from '../../jobs/types';

export type OperationKind = 'SUBMIT' | 'STATUS_SYNC' | 'ARTIFACT_DOWNLOAD' | 'EXPORT';
export type OperationState = 'PENDING' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED';
export type ProviderHandle = Readonly<Record<string, unknown>>;

export type WorkflowOperation = {
  id: string;
  kind: OperationKind;
  jobId?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  state: OperationState;
  attempt: number;
  nextRetryAt: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  lastError?: NormalizedError;
  createdAt: number;
  updatedAt: number;
};

export type EnqueueOperation = Pick<WorkflowOperation, 'id' | 'kind' | 'idempotencyKey' | 'payload'> & {
  jobId?: string;
  now: number;
  nextRetryAt?: number;
};

export type JobEvent = {
  id: string;
  jobId: string;
  sequence: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

export type TransitionResult =
  | { ok: true; current: JobRecord; event: JobEvent }
  | { ok: false; current: JobRecord };
