import type { WorkflowDefinition, WorkflowDraft, ValidationResult } from '../schema/types';
import type { JobRecord, JobRepository, JobStatus, ArtifactRecord } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import { validateWorkflowDefinition } from '../schema/validator';

type Adapter = { manifest(): Pick<PlatformAdapterManifest, 'id' | 'adapterVersion' | 'operations'>; validateCredentials(): Promise<{ ok: boolean }>; submit(input: Record<string, unknown>, target?: { operation?: string; workflowId?: string }): Promise<{ providerJobId: string }>; getStatus(handle: { providerJobId: string }): Promise<{ status: JobStatus; artifacts: ArtifactRecord[]; rawStatus?: string }> };
type RuntimeDeps = { adapters: Map<string, Adapter>; jobs: JobRepository; credentials: { get(adapterId: string): Promise<{ ok: boolean }> }; id: () => string; now?: () => number };
function valueAt(inputs: Record<string, unknown>, path: string): unknown { return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, inputs); }

export function createWorkflowRuntime(deps: RuntimeDeps) {
  const locks = new Set<string>();
  const now = deps.now ?? Date.now;
  return {
    validateDraft(workflow: WorkflowDefinition, draft: WorkflowDraft): ValidationResult {
      const definition = validateWorkflowDefinition(workflow, { adapters: Array.from(deps.adapters.values()).map((item) => ({ id: item.manifest().id, operations: item.manifest().operations })) });
      if (!definition.ok) return definition;
      const errors: Array<{ path: string; code: string; message: string }> = [];
      for (const required of Array.isArray(workflow.inputs.required) ? workflow.inputs.required : []) if (valueAt(draft.inputs, String(required)) == null || valueAt(draft.inputs, String(required)) === '') errors.push({ path: String(required), code: 'REQUIRED', message: `${required} is required` });
      return errors.length ? { ok: false, errors } : { ok: true, value: workflow };
    },
    preview(workflow: WorkflowDefinition, draft: WorkflowDraft) { return { workflowId: workflow.id, version: workflow.version, contentHash: draft.contentHash, inputs: draft.inputs, sideEffect: 'external-job' as const }; },
    async submit(workflow: WorkflowDefinition, draft: WorkflowDraft, _options: Record<string, unknown> = {}): Promise<JobRecord> {
      const validation = this.validateDraft(workflow, draft); if (!validation.ok) throw new Error(validation.errors.map((item) => item.message).join('; '));
      const adapter = deps.adapters.get(workflow.platform.adapter); if (!adapter) throw new Error('workflow adapter unavailable');
      const credential = await deps.credentials.get(workflow.platform.adapter); if (!credential.ok) throw new Error('workflow credentials unavailable');
      const validated = await adapter.validateCredentials(); if (!validated.ok) throw new Error('workflow credentials unavailable');
      const id = deps.id(); if (locks.has(id)) throw new Error('workflow submission already in progress'); locks.add(id);
      const timestamp = now();
      let job: JobRecord = { id, workflowId: workflow.id, workflowVersion: workflow.version, workflowContentHash: draft.contentHash, adapterId: adapter.manifest().id, adapterVersion: adapter.manifest().adapterVersion, inputSnapshot: draft.inputs, status: 'SUBMITTING', createdAt: timestamp, updatedAt: timestamp };
      await deps.jobs.upsert(job);
      try {
        const requestInput = Object.fromEntries(Object.entries(workflow.request.bindings).map(([target, source]) => [target, valueAt(draft.inputs, source)]));
        const remote = await adapter.submit(requestInput, { operation: workflow.platform.operation, workflowId: workflow.platform.workflowId ?? workflow.id });
        job = { ...job, status: 'QUEUED', remote: { providerJobId: remote.providerJobId }, updatedAt: now() };
        await deps.jobs.upsert(job);
        return job;
      } catch (error) { job = { ...job, status: 'UNKNOWN', error: { code: 'SUBMIT_UNKNOWN', message: error instanceof Error ? error.message : String(error) }, updatedAt: now() }; await deps.jobs.upsert(job); throw error; } finally { locks.delete(id); }
    },
    async sync(job: JobRecord): Promise<JobRecord> {
      const adapter = deps.adapters.get(job.adapterId); if (!adapter || !job.remote?.providerJobId) return job;
      const update = await adapter.getStatus({ providerJobId: job.remote.providerJobId }); const current = { ...job, status: update.status, remote: { ...job.remote, rawStatus: update.rawStatus }, updatedAt: now() }; await deps.jobs.upsert(current); await deps.jobs.replaceArtifacts(job.id, update.artifacts.map((item) => ({ ...item, jobId: job.id }))); return current;
    },
  };
}
