import { createWorkflowRuntime } from './runtime';
import { createDurableExecutor } from '../executor/durableExecutor';
import { createJobStateRepository } from '../../tasks/jobStateStore';
import { createOperationRepository } from '../executor/operationRepository';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { claimOperations } from '../../test/claimOperations';
import type { WorkflowDefinition } from '../schema/types';
import { protectDatabase } from '../../storage/databaseAccess';

test.each([false, true])('real preparation and durable execution preserve the contract (guarded=%s)', async guarded => {
  const raw = createInitializedRealSqliteTestDb();
  const db = guarded ? protectDatabase(raw as never, { startupDiagnostic: () => undefined }) : raw;
  const jobs = createJobStateRepository(db as never);
  const operations = createOperationRepository(db as never);
  let now = 1000;
  const adapter = {
    manifest: () => ({ id: 'demo', adapterVersion: '1', operations: ['workflow.submit'] }),
    validateCredentials: jest.fn(async () => ({ ok: true })),
    submit: jest.fn(async () => {
      expect(db.getFirstSync<{ status: string }>('SELECT status FROM workflow_jobs')?.status).toBe('SUBMITTING');
      return { providerJobId: 'remote-1' };
    }),
    getStatus: jest.fn(async () => ({ status: 'SUCCEEDED' as const, artifacts: [{ id: 'v', jobId: '', kind: 'file' as const, uri: 'https://cdn/video', metadata: { path: 'result.video' } }], startedAt: 1500, executionDuration: 42 })),
  };
  const adapters = new Map([['demo', adapter]]);
  const runtime = createWorkflowRuntime({ adapters });
  const durable = createDurableExecutor({ jobs, operations, runtime, adapters: adapters as never, credentials: { get: async () => ({ ok: true }) }, now: () => now });
  const workflow = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } }, request: { operation: 'workflow.submit', bindings: { text: 'prompt' } }, outputs: { artifacts: [{ kind: 'video', from: 'result.video' }] } } as WorkflowDefinition;
  try {
    const job = await durable.queueSubmission({ submissionId: 'one', workflow, draft: { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash', inputs: { prompt: 'hello' }, source: 'user', status: 'ready' }, provenance: { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash' } });
    const [submit] = await claimOperations(operations, { kind: 'SUBMIT', owner: 'worker', now, leaseMs: 10000, limit: 1 });
    await durable.handle(submit, 'worker');
    expect(adapter.submit).toHaveBeenCalledWith({ text: 'hello' }, { operation: 'workflow.submit', workflowId: 'demo' });
    expect(adapter.validateCredentials).toHaveBeenCalled();
    expect(await jobs.get(job.id)).toMatchObject({ status: 'QUEUED', workflowContentHash: 'hash', providerHandle: { providerJobId: 'remote-1' } });
    now = 100000;
    const [poll] = await claimOperations(operations, { kind: 'STATUS_SYNC', owner: 'worker', now, leaseMs: 10000, limit: 1 });
    await durable.handle(poll, 'worker');
    expect(await jobs.get(job.id)).toMatchObject({ startedAt: 1500, executionDuration: 42, status: 'SUCCEEDED' });
    expect(db.getFirstSync('SELECT kind FROM workflow_artifacts')).toEqual({ kind: 'video' });
    expect(adapter.submit).toHaveBeenCalledTimes(1);
  } finally { raw.close(); }
});
