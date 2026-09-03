import type { JobRecord, NormalizedError } from '../../jobs/types';
import type { ProviderAdapter, ProviderStatusUpdate } from '../providers/registry';
import type { PreparedWorkflowSubmission, QueueSubmissionInput } from '../runtime/runtime';
import type { JobStateRepository } from './jobStateRepository';
import type { OperationRepository } from './operationRepository';
import { classifyProviderFailure } from './errorPolicy';
import type { EnqueueOperation, WorkflowOperation } from './types';

type RuntimePreparation = {
  prepareSubmission(
    workflow: QueueSubmissionInput['workflow'],
    draft: QueueSubmissionInput['draft'],
    provenance: QueueSubmissionInput['provenance'],
  ): PreparedWorkflowSubmission;
  mapStatus(job: JobRecord, update: ProviderStatusUpdate, timestamp?: number): { job: JobRecord; artifacts: Array<Record<string, any>> };
};

type DurableExecutorDeps = {
  jobs: JobStateRepository;
  operations: OperationRepository;
  runtime: RuntimePreparation;
  adapters: Map<string, ProviderAdapter>;
  credentials: { get(adapterId: string): Promise<{ ok: boolean }> };
  now?: () => number;
};

type SubmitPayload = { prepared: PreparedWorkflowSubmission };
const terminal = new Set<JobRecord['status']>(['SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED']);

function jobId(submissionId: string): string { return `job:${submissionId}`; }
function eventId(job: JobRecord, name: string): string { return `${job.id}:event:${job.revision + 1}:${name}`; }
function statusOperation(job: JobRecord, now: number): EnqueueOperation {
  return {
    id: `${job.id}:status:${job.revision + 1}`,
    kind: 'STATUS_SYNC',
    jobId: job.id,
    idempotencyKey: `status:${job.id}:${job.revision + 1}`,
    payload: { jobId: job.id },
    now,
  };
}

export function createDurableExecutor(deps: DurableExecutorDeps) {
  const now = deps.now ?? Date.now;

  const finishFailure = (operation: WorkflowOperation, owner: string, job: JobRecord, error: NormalizedError, disposition: 'TERMINAL' | 'UNKNOWN') => {
    const timestamp = now();
    deps.jobs.transition({
      jobId: job.id,
      expectedRevision: job.revision,
      patch: { status: disposition === 'TERMINAL' ? 'FAILED' : 'UNKNOWN', lastError: error, updatedAt: timestamp },
      event: {
        id: eventId(job, disposition === 'TERMINAL' ? 'failed' : 'unknown'),
        type: disposition === 'TERMINAL' ? `${operation.kind}_FAILED` : `${operation.kind}_UNKNOWN`,
        payload: { code: error.code },
        createdAt: timestamp,
      },
    });
    deps.operations.finish(operation.id, owner, disposition === 'TERMINAL' ? 'FAILED' : 'BLOCKED', timestamp, error);
  };

  const handleSubmit = async (operation: WorkflowOperation, owner: string): Promise<void> => {
    if (!operation.jobId) {
      deps.operations.finish(operation.id, owner, 'FAILED', now(), { code: 'JOB_ID_MISSING', message: 'Submit operation has no job.' });
      return;
    }
    let job = deps.jobs.get(operation.jobId);
    if (!job) {
      deps.operations.finish(operation.id, owner, 'FAILED', now(), { code: 'JOB_NOT_FOUND', message: 'Submit job was not found.' });
      return;
    }
    if (job.providerHandle) {
      const timestamp = now();
      if (!terminal.has(job.status)) {
        const result = deps.jobs.transition({
          jobId: job.id, expectedRevision: job.revision, patch: { status: 'QUEUED', updatedAt: timestamp },
          event: { id: eventId(job, 'handle-recovered'), type: 'PROVIDER_HANDLE_RECOVERED', payload: {}, createdAt: timestamp },
          nextOperations: [statusOperation(job, timestamp)],
        });
        if (result.ok) job = result.current;
      }
      deps.operations.finish(operation.id, owner, 'SUCCEEDED', timestamp);
      return;
    }
    if (job.status !== 'READY_TO_SUBMIT') {
      const error = { code: 'SUBMIT_OUTCOME_UNKNOWN', message: 'Provider submit request outcome is unknown.' };
      if (job.status !== 'UNKNOWN' && !terminal.has(job.status)) finishFailure(operation, owner, job, error, 'UNKNOWN');
      else deps.operations.finish(operation.id, owner, job.status === 'FAILED' ? 'FAILED' : 'BLOCKED', now(), error);
      return;
    }
    const startedAt = now();
    const started = deps.jobs.transition({
      jobId: job.id, expectedRevision: job.revision, patch: { status: 'SUBMITTING', updatedAt: startedAt },
      event: { id: eventId(job, 'submit-started'), type: 'SUBMIT_STARTED', payload: {}, createdAt: startedAt },
    });
    if (!started.ok) {
      const error = { code: 'SUBMIT_CAS_CONFLICT', message: 'Submit ownership changed before provider request.' };
      deps.operations.finish(operation.id, owner, 'BLOCKED', startedAt, error);
      return;
    }
    job = started.current;
    const prepared = (operation.payload as SubmitPayload).prepared;
    const adapter = prepared && deps.adapters.get(prepared.adapterId);
    if (!prepared || !adapter) {
      finishFailure(operation, owner, job, { code: 'ADAPTER_UNAVAILABLE', message: 'Workflow adapter is unavailable.' }, 'TERMINAL');
      return;
    }
    try {
      const credential = await deps.credentials.get(prepared.adapterId);
      const validated = credential.ok && (await adapter.validateCredentials()).ok;
      if (!validated) {
        finishFailure(operation, owner, job, { code: 'CREDENTIALS_UNAVAILABLE', message: 'Provider credentials are unavailable.' }, 'TERMINAL');
        return;
      }
      const handle = await adapter.submit(prepared.requestInput, prepared.target);
      if (!handle || typeof handle !== 'object') throw new Error('provider returned an invalid handle');
      const timestamp = now();
      let current = deps.jobs.get(job.id) ?? job;
      const accepted = deps.jobs.transition({
        jobId: current.id,
        expectedRevision: current.revision,
        patch: { status: 'QUEUED', providerHandle: handle, lastError: undefined, updatedAt: timestamp },
        event: { id: eventId(current, 'submit-accepted'), type: 'SUBMIT_ACCEPTED', payload: {}, createdAt: timestamp },
        nextOperations: [statusOperation(current, timestamp)],
      });
      if (!accepted.ok && !accepted.current.providerHandle && !terminal.has(accepted.current.status)) {
        current = accepted.current;
        deps.jobs.transition({
          jobId: current.id,
          expectedRevision: current.revision,
          patch: { status: 'QUEUED', providerHandle: handle, lastError: undefined, updatedAt: timestamp },
          event: { id: eventId(current, 'submit-handle-recovered'), type: 'SUBMIT_HANDLE_PERSISTED', payload: {}, createdAt: timestamp },
          nextOperations: [statusOperation(current, timestamp)],
        });
      }
      deps.operations.finish(operation.id, owner, 'SUCCEEDED', timestamp);
    } catch (cause) {
      const failure = classifyProviderFailure('SUBMIT', cause);
      finishFailure(operation, owner, deps.jobs.get(job.id) ?? job, failure.error, failure.disposition === 'TERMINAL' ? 'TERMINAL' : 'UNKNOWN');
    }
  };

  const handleStatus = async (operation: WorkflowOperation, owner: string): Promise<void> => {
    if (!operation.jobId) {
      deps.operations.finish(operation.id, owner, 'FAILED', now(), { code: 'JOB_ID_MISSING', message: 'Status operation has no job.' });
      return;
    }
    const job = deps.jobs.get(operation.jobId);
    if (!job || !job.providerHandle) {
      if (job) finishFailure(operation, owner, job, { code: 'PROVIDER_HANDLE_MISSING', message: 'Provider handle is unavailable.' }, 'UNKNOWN');
      else deps.operations.finish(operation.id, owner, 'FAILED', now(), { code: 'JOB_NOT_FOUND', message: 'Status job was not found.' });
      return;
    }
    const adapter = deps.adapters.get(job.adapterId);
    if (!adapter) {
      finishFailure(operation, owner, job, { code: 'ADAPTER_UNAVAILABLE', message: 'Workflow adapter is unavailable.' }, 'TERMINAL');
      return;
    }
    try {
      const update = await adapter.getStatus(job.providerHandle);
      const timestamp = now();
      const mapped = deps.runtime.mapStatus(job, update, timestamp);
      const nextOperations: EnqueueOperation[] = [];
      if (update.status === 'QUEUED' || update.status === 'RUNNING') {
        nextOperations.push({ ...statusOperation(job, timestamp), nextRetryAt: timestamp + 5_000 });
      } else if (update.status === 'SUCCEEDED' || update.status === 'PARTIAL_SUCCEEDED') {
        for (const artifact of mapped.artifacts) {
          nextOperations.push({
            id: `${job.id}:artifact:${String(artifact.id)}`,
            kind: 'ARTIFACT_DOWNLOAD',
            jobId: job.id,
            idempotencyKey: `artifact:${job.id}:${String(artifact.id)}`,
            payload: { artifact },
            now: timestamp,
          });
        }
      }
      const result = deps.jobs.transition({
        jobId: job.id,
        expectedRevision: job.revision,
        patch: {
          status: mapped.job.status,
          providerHandle: mapped.job.providerHandle,
          startedAt: mapped.job.startedAt,
          executionDuration: mapped.job.executionDuration,
          nextSyncAt: nextOperations.some((item) => item.kind === 'STATUS_SYNC') ? timestamp + 5_000 : undefined,
          lastError: undefined,
          updatedAt: timestamp,
        },
        event: { id: eventId(job, 'status'), type: 'STATUS_RECONCILED', payload: { status: update.status }, createdAt: timestamp },
        nextOperations,
      });
      deps.operations.finish(operation.id, owner, 'SUCCEEDED', timestamp);
      if (!result.ok) return;
    } catch (cause) {
      const timestamp = now();
      const failure = classifyProviderFailure('STATUS_SYNC', cause);
      if (failure.disposition === 'RETRYABLE') {
        const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
        deps.jobs.transition({
          jobId: job.id, expectedRevision: job.revision,
          patch: { lastError: failure.error, nextSyncAt: nextRetryAt, updatedAt: timestamp },
          event: { id: eventId(job, 'status-retry'), type: 'STATUS_RETRY_SCHEDULED', payload: { code: failure.error.code }, createdAt: timestamp },
        });
        deps.operations.retry(operation.id, owner, { now: timestamp, nextRetryAt, error: failure.error });
      } else finishFailure(operation, owner, deps.jobs.get(job.id) ?? job, failure.error, 'TERMINAL');
    }
  };

  return {
    async queueSubmission(input: QueueSubmissionInput): Promise<JobRecord> {
      const id = jobId(input.submissionId);
      const existing = deps.jobs.get(id);
      if (existing) return existing;
      const prepared = deps.runtime.prepareSubmission(input.workflow, input.draft, input.provenance);
      const timestamp = now();
      const job: JobRecord = {
        id, revision: 0, workflowId: prepared.workflowId, workflowVersion: prepared.workflowVersion,
        workflowContentHash: prepared.workflowContentHash, adapterId: prepared.adapterId, adapterVersion: prepared.adapterVersion,
        inputSnapshot: prepared.inputSnapshot, outputMapping: prepared.outputMapping, status: 'READY_TO_SUBMIT',
        createdAt: timestamp, updatedAt: timestamp,
      };
      return deps.jobs.createWithEventAndOperation(
        job,
        { id: `${id}:event:0:validated`, type: 'VALIDATED', payload: { workflowContentHash: prepared.workflowContentHash }, createdAt: timestamp },
        { id: `${id}:submit`, kind: 'SUBMIT', jobId: id, idempotencyKey: `submit:${input.submissionId}`, payload: { prepared }, now: timestamp },
      );
    },
    async handle(operation: WorkflowOperation, owner: string): Promise<void> {
      if (operation.kind === 'SUBMIT') return handleSubmit(operation, owner);
      if (operation.kind === 'STATUS_SYNC') return handleStatus(operation, owner);
      throw new Error(`unsupported operation kind: ${operation.kind}`);
    },
    async recover(timestamp: number): Promise<void> {
      const uncertain = deps.operations.recoverExpired(timestamp);
      for (const operation of uncertain) {
        if (!operation.jobId || !operation.leaseOwner) continue;
        const job = deps.jobs.get(operation.jobId);
        if (!job) {
          deps.operations.finish(operation.id, operation.leaseOwner, 'FAILED', timestamp, { code: 'JOB_NOT_FOUND', message: 'Submit job was not found.' });
          continue;
        }
        if (job.status === 'READY_TO_SUBMIT') {
          deps.operations.release(operation.id, operation.leaseOwner, timestamp);
          continue;
        }
        if (job.providerHandle) {
          const result = deps.jobs.transition({
            jobId: job.id, expectedRevision: job.revision, patch: { status: 'QUEUED', updatedAt: timestamp },
            event: { id: eventId(job, 'recovered-handle'), type: 'PROVIDER_HANDLE_RECOVERED', payload: {}, createdAt: timestamp },
            nextOperations: [statusOperation(job, timestamp)],
          });
          deps.operations.finish(operation.id, operation.leaseOwner, 'SUCCEEDED', timestamp);
          if (!result.ok) continue;
          continue;
        }
        if (job.status === 'SUBMITTING') {
          finishFailure(operation, operation.leaseOwner, job, { code: 'SUBMIT_OUTCOME_UNKNOWN', message: 'Provider submit request outcome is unknown.' }, 'UNKNOWN');
        } else {
          deps.operations.finish(operation.id, operation.leaseOwner, terminal.has(job.status) && job.status === 'FAILED' ? 'FAILED' : 'BLOCKED', timestamp);
        }
      }
    },
    async createReplacementAttemptAfterConfirmation(originalJobId: string, submissionId: string): Promise<JobRecord> {
      const original = deps.jobs.get(originalJobId);
      if (!original || original.status !== 'UNKNOWN') throw new Error('only UNKNOWN jobs can be explicitly replaced');
      const source = deps.operations.list('SUBMIT').find((operation) => operation.jobId === originalJobId);
      const prepared = (source?.payload as SubmitPayload | undefined)?.prepared;
      if (!prepared) throw new Error('original submit payload is unavailable');
      const id = jobId(submissionId);
      const existing = deps.jobs.get(id);
      if (existing) return existing;
      const timestamp = now();
      const replacement: JobRecord = {
        ...original,
        id,
        revision: 0,
        providerHandle: undefined,
        remote: undefined,
        lastError: undefined,
        error: undefined,
        nextSyncAt: undefined,
        status: 'READY_TO_SUBMIT',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return deps.jobs.createWithEventAndOperation(
        replacement,
        { id: `${id}:event:0:replacement`, type: 'REPLACEMENT_CONFIRMED', payload: { originalJobId }, createdAt: timestamp },
        { id: `${id}:submit`, kind: 'SUBMIT', jobId: id, idempotencyKey: `submit:${submissionId}`, payload: { prepared }, now: timestamp },
      );
    },
  };
}

export type DurableExecutor = ReturnType<typeof createDurableExecutor>;
