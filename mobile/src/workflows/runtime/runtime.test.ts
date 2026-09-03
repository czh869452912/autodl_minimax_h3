import { createWorkflowRuntime } from './runtime';
import type { WorkflowDefinition } from '../schema/types';
import type { JobRecord } from '../../jobs/types';

const workflow = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 1 } } }, request: { operation: 'workflow.submit', bindings: { prompt: 'prompt' } }, outputs: { artifacts: [{ kind: 'video', from: 'result.video' }] } } as WorkflowDefinition;
const draft = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash', inputs: { prompt: 'hello' }, source: 'user' as const, status: 'ready' as const };
const provenance = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash' };

function deps() {
  const jobs: JobRecord[] = [];
  const adapter = { manifest: () => ({ id: 'demo', adapterVersion: '1.0.0', platforms: ['demo'], capabilities: ['workflow.submit'], credentialKinds: [], operations: ['workflow.submit'], supportedArtifactKinds: ['video'] as const }), validateCredentials: jest.fn(async () => ({ ok: true })), submit: jest.fn(async () => ({ providerJobId: 'remote-1' })), getStatus: jest.fn(async () => ({ status: 'SUCCEEDED' as const, artifacts: [{ id: 'a', jobId: '', kind: 'video' as const, uri: 'https://cdn.test/video' }] })) };
  return { jobs, adapter, deps: { adapters: new Map([['demo', adapter]]), jobs: { upsert: jest.fn(async (job: JobRecord) => { const i = jobs.findIndex((item) => item.id === job.id); if (i >= 0) jobs[i] = job; else jobs.push(job); }), get: jest.fn(async (id: string) => jobs.find((item) => item.id === id)), list: jest.fn(async () => jobs), replaceArtifacts: jest.fn(), listArtifacts: jest.fn(async () => []) }, credentials: { get: jest.fn(async () => ({ ok: true })) }, id: () => 'local-1', now: () => 1000 } };
}

test('validates drafts before network calls and previews provenance', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  expect(runtime.validateDraft(workflow, draft, provenance).ok).toBe(true);
  expect(runtime.preview(workflow, draft)).toMatchObject({ workflowId: 'demo', version: '1.0.0', contentHash: 'hash' });
  expect(value.adapter.submit).not.toHaveBeenCalled();
});

test('prepares a deterministic request without credentials, persistence, or provider calls', () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  expect(runtime.prepareSubmission(workflow, draft, provenance)).toMatchObject({
    workflowId: 'demo',
    workflowContentHash: 'hash',
    requestInput: { prompt: 'hello' },
    target: { operation: 'workflow.submit', workflowId: 'demo' },
  });
  expect(value.deps.credentials.get).not.toHaveBeenCalled();
  expect(value.deps.jobs.upsert).not.toHaveBeenCalled();
  expect(value.adapter.submit).not.toHaveBeenCalled();
});

test('maps status and output artifacts without persistence', () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  const current: JobRecord = {
    id: 'local-1', revision: 2, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
    adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: draft.inputs, outputMapping: workflow.outputs,
    providerHandle: { providerJobId: 'remote-1' }, status: 'RUNNING', createdAt: 100, updatedAt: 100,
  };
  const mapped = runtime.mapStatus(current, {
    status: 'SUCCEEDED', artifacts: [{ id: 'a', jobId: '', kind: 'file', metadata: { path: 'result.video' } }],
  }, 200);
  expect(mapped).toMatchObject({ job: { status: 'SUCCEEDED', updatedAt: 200 }, artifacts: [{ kind: 'video', jobId: 'local-1' }] });
  expect(value.deps.jobs.upsert).not.toHaveBeenCalled();
  expect(value.deps.jobs.replaceArtifacts).not.toHaveBeenCalled();
});

test('requires explicit active workflow provenance before validation', () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  expect(runtime.validateDraft(workflow, draft)).toMatchObject({ ok: false, errors: [{ code: 'PROVENANCE_REQUIRED' }] });
});

test('rejects submission without provenance before side effects', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  await expect(runtime.submit(workflow, draft, {} as never)).rejects.toThrow('workflow provenance is required');
  expect(value.deps.credentials.get).not.toHaveBeenCalled();
  expect(value.deps.jobs.upsert).not.toHaveBeenCalled();
  expect(value.adapter.submit).not.toHaveBeenCalled();
});

test.each([
  ['id', { workflowId: 'other' }],
  ['version', { workflowVersion: '2.0.0' }],
] as const)('rejects draft provenance mismatch for %s before side effects', (_field, change) => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
    const result = runtime.validateDraft(workflow, { ...draft, ...change }, provenance);
  expect(result.ok).toBe(false);
  expect(value.adapter.validateCredentials).not.toHaveBeenCalled();
});

test('rejects content hash mismatch against the selected active record', () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  const result = runtime.validateDraft(workflow, draft, { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'active-hash' });
  expect(result.ok).toBe(false);
});

test('submit does not call credentials or jobs when provenance is stale', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  await expect(runtime.submit(workflow, draft, { provenance: { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'active-hash' } })).rejects.toThrow();
  expect(value.deps.credentials.get).not.toHaveBeenCalled();
  expect(value.deps.jobs.upsert).not.toHaveBeenCalled();
  expect(value.adapter.submit).not.toHaveBeenCalled();
});

test('persists submitting state and returns a normalized job', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  const result = await runtime.submit(workflow, draft, { provenance });
  expect(result).toMatchObject({ id: 'local-1', status: 'QUEUED', remote: { providerJobId: 'remote-1' }, workflowContentHash: 'hash', outputMapping: workflow.outputs });
  expect(value.deps.jobs.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUBMITTING' }));
  expect(value.adapter.validateCredentials).toHaveBeenCalled();
  expect(value.adapter.submit).toHaveBeenCalledWith(draft.inputs, { operation: 'workflow.submit', workflowId: 'demo' });
});

test('applies workflow request bindings before invoking the adapter', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  const mapped = { ...workflow, request: { operation: 'workflow.submit', bindings: { text: 'prompt' } } } as WorkflowDefinition;
  await runtime.submit(mapped, draft, { provenance });
  expect(value.adapter.submit).toHaveBeenCalledWith({ text: 'hello' }, { operation: 'workflow.submit', workflowId: 'demo' });
});

test('persists normalized provider timing during status synchronization', async () => {
  const value = deps();
  value.adapter.getStatus.mockResolvedValueOnce({ status: 'SUCCEEDED', artifacts: [], startedAt: 1_500, executionDuration: 42 } as never);
  const runtime = createWorkflowRuntime(value.deps);
  const submitted = await runtime.submit(workflow, draft, { provenance });
  const synced = await runtime.sync({ ...submitted, startedAt: undefined, executionDuration: undefined } as never);
  expect(synced).toMatchObject({ startedAt: 1_500, executionDuration: 42 });
});

test('records fallback timing when provider omits timing fields on a terminal result', async () => {
  const value = deps();
  value.adapter.getStatus.mockResolvedValueOnce({ status: 'SUCCEEDED', artifacts: [] } as never);
  const runtime = createWorkflowRuntime(value.deps);
  const submitted = await runtime.submit(workflow, draft, { provenance });
  const synced = await runtime.sync(submitted);
  expect(synced.startedAt).toBe(1000);
  expect(synced.executionDuration).toBe(0);
});

test('applies persisted workflow output mapping to provider artifacts', async () => {
  const value = deps();
  value.adapter.getStatus.mockResolvedValueOnce({ status: 'SUCCEEDED', artifacts: [{ id: 'result-1', jobId: '', kind: 'file', uri: 'https://cdn/video', metadata: { path: 'result.video' } }] } as never);
  const runtime = createWorkflowRuntime(value.deps);
  const submitted = await runtime.submit(workflow, draft, { provenance });
  await runtime.sync(submitted);
  expect(value.deps.jobs.replaceArtifacts).toHaveBeenCalledWith('local-1', [expect.objectContaining({ id: 'result-1', kind: 'video' })]);
});

test('does not rewrite an unchanged provider snapshot', async () => {
  const value = deps();
  value.adapter.getStatus.mockResolvedValue({ status: 'SUCCEEDED', artifacts: [{ id: 'a', jobId: '', kind: 'video', uri: 'https://cdn.test/video' }] } as never);
  const runtime = createWorkflowRuntime(value.deps);
  const submitted = await runtime.submit(workflow, draft, { provenance });
  value.deps.jobs.listArtifacts.mockResolvedValue([{ id: 'a', jobId: 'local-1', kind: 'video', uri: 'https://cdn.test/video', metadata: { path: 'result.video' } }] as never);
  const first = await runtime.sync(submitted);
  value.deps.jobs.upsert.mockClear();
  value.deps.jobs.replaceArtifacts.mockClear();
  await runtime.sync(first);
  expect(value.deps.jobs.upsert).not.toHaveBeenCalled();
  expect(value.deps.jobs.replaceArtifacts).not.toHaveBeenCalled();
});
