import { createWorkflowRuntime } from './runtime';
import type { WorkflowDefinition } from '../schema/types';
import type { JobRecord } from '../../jobs/types';

const workflow = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 1 } } }, request: { operation: 'workflow.submit', bindings: { prompt: 'prompt' } }, outputs: { artifacts: [{ kind: 'video', from: 'result.video' }] } } as WorkflowDefinition;
const draft = { workflowId: 'demo', workflowVersion: '1.0.0', contentHash: 'hash', inputs: { prompt: 'hello' }, source: 'user' as const, status: 'ready' as const };

function deps() {
  const jobs: JobRecord[] = [];
  const adapter = { manifest: () => ({ id: 'demo', adapterVersion: '1.0.0', platforms: ['demo'], capabilities: ['workflow.submit'], credentialKinds: [], operations: ['workflow.submit'], supportedArtifactKinds: ['video'] as const }), validateCredentials: jest.fn(async () => ({ ok: true })), submit: jest.fn(async () => ({ providerJobId: 'remote-1' })), getStatus: jest.fn(async () => ({ status: 'SUCCEEDED' as const, artifacts: [{ id: 'a', jobId: '', kind: 'video' as const, uri: 'https://cdn.test/video' }] })) };
  return { jobs, adapter, deps: { adapters: new Map([['demo', adapter]]), jobs: { upsert: jest.fn(async (job: JobRecord) => { const i = jobs.findIndex((item) => item.id === job.id); if (i >= 0) jobs[i] = job; else jobs.push(job); }), get: jest.fn(async (id: string) => jobs.find((item) => item.id === id)), list: jest.fn(async () => jobs), replaceArtifacts: jest.fn(), listArtifacts: jest.fn(async () => []) }, credentials: { get: jest.fn(async () => ({ ok: true })) }, id: () => 'local-1', now: () => 1000 } };
}

test('validates drafts before network calls and previews provenance', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  expect(runtime.validateDraft(workflow, draft).ok).toBe(true);
  expect(runtime.preview(workflow, draft)).toMatchObject({ workflowId: 'demo', version: '1.0.0', contentHash: 'hash' });
  expect(value.adapter.submit).not.toHaveBeenCalled();
});

test('persists submitting state and returns a normalized job', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  const result = await runtime.submit(workflow, draft, {});
  expect(result).toMatchObject({ id: 'local-1', status: 'QUEUED', remote: { providerJobId: 'remote-1' }, workflowContentHash: 'hash' });
  expect(value.deps.jobs.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUBMITTING' }));
  expect(value.adapter.validateCredentials).toHaveBeenCalled();
  expect(value.adapter.submit).toHaveBeenCalledWith(draft.inputs, { operation: 'workflow.submit', workflowId: 'demo' });
});

test('applies workflow request bindings before invoking the adapter', async () => {
  const value = deps();
  const runtime = createWorkflowRuntime(value.deps);
  const mapped = { ...workflow, request: { operation: 'workflow.submit', bindings: { text: 'prompt' } } } as WorkflowDefinition;
  await runtime.submit(mapped, draft, {});
  expect(value.adapter.submit).toHaveBeenCalledWith({ text: 'hello' }, { operation: 'workflow.submit', workflowId: 'demo' });
});

test('persists normalized provider timing during status synchronization', async () => {
  const value = deps();
  value.adapter.getStatus.mockResolvedValueOnce({ status: 'SUCCEEDED', artifacts: [], startedAt: 1_500, executionDuration: 42 } as never);
  const runtime = createWorkflowRuntime(value.deps);
  const submitted = await runtime.submit(workflow, draft, {});
  const synced = await runtime.sync({ ...submitted, startedAt: undefined, executionDuration: undefined } as never);
  expect(synced).toMatchObject({ startedAt: 1_500, executionDuration: 42 });
});

test('records fallback timing when provider omits timing fields on a terminal result', async () => {
  const value = deps();
  value.adapter.getStatus.mockResolvedValueOnce({ status: 'SUCCEEDED', artifacts: [] } as never);
  const runtime = createWorkflowRuntime(value.deps);
  const submitted = await runtime.submit(workflow, draft, {});
  const synced = await runtime.sync(submitted);
  expect(synced.startedAt).toBe(1000);
  expect(synced.executionDuration).toBe(0);
});
