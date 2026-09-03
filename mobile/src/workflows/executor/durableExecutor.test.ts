import { ProviderError } from '../providers/autodl/client';
import type { QueueSubmissionInput } from '../runtime/runtime';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createJobStateRepository } from './jobStateRepository';
import { createOperationRepository } from './operationRepository';
import { createDurableExecutor } from './durableExecutor';

const workflow = { id: 'demo', version: '1.0.0', outputs: { artifacts: [{ kind: 'video', from: 'result.video' }] } } as never;
const draft = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash', inputs: { prompt: 'hello' } } as never;
const provenance = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash' };
const input = (submissionId: string): QueueSubmissionInput => ({ submissionId, workflow, draft, provenance });

function setup() {
  const db = createInitializedRealSqliteTestDb();
  const jobs = createJobStateRepository(db as never);
  const operations = createOperationRepository(db as never);
  let clock = 100;
  const adapter = {
    manifest: () => ({ id: 'demo', adapterVersion: '1.0.0' }),
    validateCredentials: jest.fn(async () => ({ ok: true })),
    submit: jest.fn(async () => ({ providerJobId: 'remote-1', opaque: 'kept' })),
    getStatus: jest.fn(async () => ({ status: 'RUNNING' as const, artifacts: [], rawStatus: 'running' })),
  };
  const runtime = {
    prepareSubmission: jest.fn(() => ({
      workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'demo', adapterVersion: '1.0.0',
      inputSnapshot: { prompt: 'hello' }, requestInput: { prompt: 'hello' }, outputMapping: { artifacts: [{ kind: 'video' as const, from: 'result.video' }] },
      target: { operation: 'workflow.submit', workflowId: 'demo' },
    })),
    mapStatus: jest.fn((job, update) => ({
      job: { ...job, status: update.status, updatedAt: clock },
      artifacts: update.artifacts.map((artifact: Record<string, any>) => ({ ...artifact, jobId: job.id, kind: artifact.metadata?.path === 'result.video' ? 'video' : artifact.kind })),
    })),
  };
  const service = createDurableExecutor({
    jobs, operations, runtime, adapters: new Map([['demo', adapter]]) as never,
    credentials: { get: jest.fn(async () => ({ ok: true })) }, now: () => clock,
  });
  return { db, jobs, operations, adapter, runtime, service, setNow: (value: number) => { clock = value; } };
}

test('duplicate queueing returns one job and one submit operation without provider calls', async () => {
  const value = setup();
  try {
    const first = await value.service.queueSubmission(input('submission-1'));
    const second = await value.service.queueSubmission(input('submission-1'));
    expect(second.id).toBe(first.id);
    expect(value.operations.list('SUBMIT')).toHaveLength(1);
    expect(value.adapter.submit).not.toHaveBeenCalled();
  } finally { value.db.close(); }
});

test('pending work survives restart and persists the opaque handle before status work', async () => {
  const value = setup();
  try {
    const queued = await value.service.queueSubmission(input('submission-2'));
    const [claimed] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(claimed, 'worker');
    expect(value.adapter.submit).toHaveBeenCalledTimes(1);
    expect(value.jobs.get(queued.id)).toMatchObject({ status: 'QUEUED', providerHandle: { providerJobId: 'remote-1', opaque: 'kept' } });
    expect(value.operations.get(claimed.id)).toMatchObject({ state: 'SUCCEEDED' });
    expect(value.operations.list('STATUS_SYNC')).toHaveLength(1);
  } finally { value.db.close(); }
});

test('expired SUBMITTING without handle becomes UNKNOWN and never resubmits', async () => {
  const value = setup();
  try {
    const queued = await value.service.queueSubmission(input('submission-3'));
    const [claimed] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'dead-process', now: 100, leaseMs: 50, limit: 1 });
    value.jobs.transition({
      jobId: queued.id, expectedRevision: queued.revision, patch: { status: 'SUBMITTING' },
      event: { id: 'submit-started', type: 'SUBMIT_STARTED', payload: {}, createdAt: 100 },
    });
    expect(claimed.leaseExpiresAt).toBe(150);
    await value.service.recover(151);
    expect(value.adapter.submit).not.toHaveBeenCalled();
    expect(value.jobs.get(queued.id)).toMatchObject({ status: 'UNKNOWN' });
    expect(value.operations.get(claimed.id)).toMatchObject({ state: 'BLOCKED' });
  } finally { value.db.close(); }
});

test.each([401, 422])('deterministic submit HTTP %s fails terminally', async (status) => {
  const value = setup();
  value.adapter.submit.mockRejectedValueOnce(new ProviderError('autodl', 'submit', status === 401 ? 'auth' : 'http', 'secret payload', status));
  try {
    const queued = await value.service.queueSubmission(input(`terminal-${status}`));
    const [claimed] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(claimed, 'worker');
    expect(value.jobs.get(queued.id)).toMatchObject({ status: 'FAILED', lastError: { code: expect.stringContaining(String(status)) } });
    expect(value.operations.get(claimed.id)).toMatchObject({ state: 'FAILED' });
  } finally { value.db.close(); }
});

test('submit timeout becomes UNKNOWN and blocks automatic resubmission', async () => {
  const value = setup();
  value.adapter.submit.mockRejectedValueOnce(new ProviderError('autodl', 'submit', 'timeout', 'token=secret'));
  try {
    const queued = await value.service.queueSubmission(input('timeout'));
    const [claimed] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(claimed, 'worker');
    expect(value.jobs.get(queued.id)).toMatchObject({ status: 'UNKNOWN' });
    expect(value.operations.get(claimed.id)).toMatchObject({ state: 'BLOCKED' });
    expect(value.adapter.submit).toHaveBeenCalledTimes(1);
    expect(value.operations.claimDue({ kind: 'SUBMIT', owner: 'other', now: 1000, leaseMs: 50, limit: 1 })).toEqual([]);
  } finally { value.db.close(); }
});

test('a CAS conflict before SUBMIT blocks the operation without a provider call', async () => {
  const value = setup();
  try {
    const queued = await value.service.queueSubmission(input('cas-conflict'));
    const [claimed] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    const jobs = {
      ...value.jobs,
      transition: jest.fn(() => ({ ok: false as const, current: { ...queued, revision: 1, status: 'SUBMITTING' as const } })),
    };
    const service = createDurableExecutor({
      jobs, operations: value.operations, runtime: value.runtime,
      adapters: new Map([['demo', value.adapter]]) as never,
      credentials: { get: jest.fn(async () => ({ ok: true })) }, now: () => 100,
    });
    await service.handle(claimed, 'worker');
    expect(value.adapter.submit).not.toHaveBeenCalled();
    expect(value.operations.get(claimed.id)).toMatchObject({ state: 'BLOCKED', lastError: { code: 'SUBMIT_CAS_CONFLICT' } });
  } finally { value.db.close(); }
});

test('status reconciliation uses only the persisted handle and maps artifacts to operations', async () => {
  const value = setup();
  value.adapter.getStatus.mockResolvedValueOnce({
    status: 'SUCCEEDED', rawStatus: 'done',
    artifacts: [{ id: 'artifact-1', jobId: '', kind: 'file', uri: 'https://cdn.test/video', metadata: { path: 'result.video' } }],
  } as never);
  try {
    const queued = await value.service.queueSubmission(input('status-success'));
    const [submit] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(submit, 'worker');
    const [status] = value.operations.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(status, 'worker');
    expect(value.adapter.getStatus).toHaveBeenCalledWith({ providerJobId: 'remote-1', opaque: 'kept' });
    expect(value.adapter.submit).toHaveBeenCalledTimes(1);
    expect(value.jobs.get(queued.id)).toMatchObject({ status: 'SUCCEEDED' });
    expect(value.operations.list('ARTIFACT_DOWNLOAD')).toMatchObject([
      { payload: { artifact: expect.objectContaining({ id: 'artifact-1', kind: 'video' }) } },
    ]);
  } finally { value.db.close(); }
});

test('status 503 retries the same operation without submitting again', async () => {
  const value = setup();
  try {
    await value.service.queueSubmission(input('status-retry'));
    const [submit] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(submit, 'worker');
    const [status] = value.operations.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    value.adapter.getStatus.mockRejectedValueOnce(new ProviderError('autodl', 'status', 'http', 'upstream secret', 503));
    value.setNow(200);
    await value.service.handle(status, 'worker');
    expect(value.operations.get(status.id)).toMatchObject({ state: 'PENDING', nextRetryAt: expect.any(Number), lastError: { retryable: true } });
    expect(value.adapter.submit).toHaveBeenCalledTimes(1);
  } finally { value.db.close(); }
});

test('explicit replacement preserves the original UNKNOWN snapshot and audit', async () => {
  const value = setup();
  value.adapter.submit.mockRejectedValueOnce(new ProviderError('autodl', 'submit', 'network', 'offline'));
  try {
    const original = await value.service.queueSubmission(input('original'));
    const [submit] = value.operations.claimDue({ kind: 'SUBMIT', owner: 'worker', now: 100, leaseMs: 50, limit: 1 });
    await value.service.handle(submit, 'worker');
    const auditLength = value.jobs.listEvents(original.id).length;
    const replacement = await value.service.createReplacementAttemptAfterConfirmation(original.id, 'replacement');
    expect(replacement.id).not.toBe(original.id);
    expect(replacement).toMatchObject({ status: 'READY_TO_SUBMIT', revision: 0 });
    expect(value.jobs.get(original.id)).toMatchObject({ status: 'UNKNOWN' });
    expect(value.jobs.listEvents(original.id)).toHaveLength(auditLength);
    expect(value.operations.list('SUBMIT')).toHaveLength(2);
  } finally { value.db.close(); }
});
