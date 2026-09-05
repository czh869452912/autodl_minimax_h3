import fs from 'fs';
import os from 'os';
import path from 'path';
import type { QueueSubmissionInput } from '../runtime/runtime';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createDurableExecutor } from './durableExecutor';
import { createJobStateRepository } from './jobStateRepository';
import { createOperationRepository } from './operationRepository';
import { createExecutorTick } from './tick';

const workflow = { id: 'demo', version: '1.0.0', outputs: { artifacts: [] } } as never;
const draft = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash', inputs: { prompt: 'hello' } } as never;
const provenance = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash' };
const input = (submissionId: string): QueueSubmissionInput => ({ submissionId, workflow, draft, provenance });

function createProvider() {
  return {
    manifest: () => ({ id: 'demo', adapterVersion: '1.0.0' }),
    validateCredentials: jest.fn(async () => ({ ok: true })),
    submit: jest.fn(async () => ({ providerJobId: 'remote-acceptance', opaque: 'preserved' })),
    getStatus: jest.fn(async () => ({ status: 'RUNNING' as const, artifacts: [], rawStatus: 'running' })),
  };
}

function openRuntime(file: string, provider: ReturnType<typeof createProvider>, now: () => number) {
  const db = createInitializedRealSqliteTestDb(file);
  const jobs = createJobStateRepository(db as never);
  const operations = createOperationRepository(db as never);
  const runtime = {
    prepareSubmission: jest.fn(() => ({
      workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash', adapterId: 'demo', adapterVersion: '1.0.0',
      inputSnapshot: { prompt: 'hello' }, requestInput: { prompt: 'hello' }, outputMapping: { artifacts: [] },
      target: { operation: 'workflow.submit', workflowId: 'demo' },
    })),
    mapStatus: jest.fn((job, update) => ({ job: { ...job, status: update.status, updatedAt: now() }, artifacts: [] })),
  };
  const service = createDurableExecutor({
    jobs, operations, runtime, adapters: new Map([['demo', provider]]) as never,
    credentials: { get: jest.fn(async () => ({ ok: true })) }, now,
  });
  return { db, jobs, operations, service };
}

function databaseFile(label: string): string {
  return path.join(os.tmpdir(), `autodl-h3-${label}-${process.pid}-${Date.now()}-${Math.random()}.db`);
}

test('a PENDING submit survives a database reopen and calls the provider once', async () => {
  const file = databaseFile('pending');
  const provider = createProvider();
  try {
    const first = openRuntime(file, provider, () => 100);
    await first.service.queueSubmission(input('pending-restart'));
    first.db.close();

    const restarted = openRuntime(file, provider, () => 151);
    try {
      const [submit] = await restarted.operations.claimDue({ kind: 'SUBMIT', owner: 'restart', now: 151, leaseMs: 50, limit: 1 });
      await restarted.service.handle(submit, 'restart');
      expect(provider.submit).toHaveBeenCalledTimes(1);
      expect(await restarted.operations.get(submit.id)).toMatchObject({ state: 'SUCCEEDED' });
      expect(restarted.jobs.get(submit.jobId!)).toMatchObject({
        status: 'QUEUED', providerHandle: { providerJobId: 'remote-acceptance', opaque: 'preserved' },
      });
    } finally { restarted.db.close(); }
  } finally { fs.rmSync(file, { force: true }); }
});

test('an expired SUBMITTING submit without a handle reopens UNKNOWN/BLOCKED without resubmission', async () => {
  const file = databaseFile('unknown');
  const provider = createProvider();
  try {
    const first = openRuntime(file, provider, () => 100);
    const job = await first.service.queueSubmission(input('unknown-restart'));
    const [submit] = await first.operations.claimDue({ kind: 'SUBMIT', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    first.jobs.transition({
      jobId: job.id, expectedRevision: job.revision, patch: { status: 'SUBMITTING', updatedAt: 100 },
      event: { id: `${job.id}:acceptance:started`, type: 'SUBMIT_STARTED', payload: {}, createdAt: 100 },
    });
    first.db.close();

    const restarted = openRuntime(file, provider, () => 151);
    try {
      await restarted.service.recover(151);
      expect(provider.submit).not.toHaveBeenCalled();
      expect(restarted.jobs.get(job.id)).toMatchObject({ status: 'UNKNOWN' });
      expect(await restarted.operations.get(submit.id)).toMatchObject({ state: 'BLOCKED' });
      expect(await restarted.operations.claimDue({ kind: 'SUBMIT', owner: 'other', now: 1_000, leaseMs: 50, limit: 1 })).toEqual([]);
    } finally { restarted.db.close(); }
  } finally { fs.rmSync(file, { force: true }); }
});

test('a persisted provider handle reopens into status-only recovery with the original opaque handle', async () => {
  const file = databaseFile('handle');
  const provider = createProvider();
  try {
    const first = openRuntime(file, provider, () => 100);
    const job = await first.service.queueSubmission(input('handle-restart'));
    const [submit] = await first.operations.claimDue({ kind: 'SUBMIT', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    const started = first.jobs.transition({
      jobId: job.id, expectedRevision: job.revision, patch: { status: 'SUBMITTING', updatedAt: 100 },
      event: { id: `${job.id}:acceptance:started`, type: 'SUBMIT_STARTED', payload: {}, createdAt: 100 },
    });
    if (!started.ok) throw new Error('failed to create acceptance fixture');
    first.jobs.transition({
      jobId: job.id, expectedRevision: started.current.revision,
      patch: { status: 'QUEUED', providerHandle: { providerJobId: 'remote-original', opaque: 'opaque-original' }, updatedAt: 101 },
      event: { id: `${job.id}:acceptance:handle`, type: 'SUBMIT_HANDLE_PERSISTED', payload: {}, createdAt: 101 },
    });
    first.db.close();

    const restarted = openRuntime(file, provider, () => 151);
    try {
      await restarted.service.recover(151);
      const [status] = await restarted.operations.claimDue({ kind: 'STATUS_SYNC', owner: 'restart', now: 151, leaseMs: 50, limit: 1 });
      await restarted.service.handle(status, 'restart');
      expect(provider.submit).not.toHaveBeenCalled();
      expect(provider.getStatus).toHaveBeenCalledTimes(1);
      expect(provider.getStatus).toHaveBeenCalledWith({ providerJobId: 'remote-original', opaque: 'opaque-original' });
      expect(await restarted.operations.get(submit.id)).toMatchObject({ state: 'SUCCEEDED' });
    } finally { restarted.db.close(); }
  } finally { fs.rmSync(file, { force: true }); }
});

test('independent foreground and background ticks race to one lease owner and one provider submit', async () => {
  const file = databaseFile('race');
  const provider = createProvider();
  const first = openRuntime(file, provider, () => 100);
  let second: ReturnType<typeof openRuntime> | undefined;
  try {
    await first.service.queueSubmission(input('tick-race'));
    second = openRuntime(file, provider, () => 100);
    const foreground = createExecutorTick({ operations: first.operations, executor: first.service, owner: () => 'foreground', isReadonly: () => false });
    const background = createExecutorTick({ operations: second.operations, executor: second.service, owner: () => 'background', isReadonly: () => false });

    const [foregroundResult, backgroundResult] = await Promise.all([
      foreground.run({ reason: 'foreground', maxOperations: 1, now: 100 }),
      background.run({ reason: 'background', maxOperations: 1, now: 100 }),
    ]);

    expect(foregroundResult.claimed + backgroundResult.claimed).toBe(1);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(first.operations.list('SUBMIT')).toHaveLength(1);
    expect(first.operations.list('SUBMIT')[0]).toMatchObject({ state: 'SUCCEEDED', attempt: 1 });
  } finally {
    second?.db.close();
    first.db.close();
    fs.rmSync(file, { force: true });
  }
});
