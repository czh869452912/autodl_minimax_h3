import type { WorkflowDefinition, WorkflowDraft, ValidationResult } from '../schema/types';
import type { JobRecord, JobRepository, JobStatus, ArtifactRecord } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import { validateWorkflowDefinition } from '../schema/validator';
import { compileWorkflow } from '../compiler/compiler';

type Adapter = { manifest(): Pick<PlatformAdapterManifest, 'id' | 'adapterVersion' | 'operations'>; validateCredentials(): Promise<{ ok: boolean }>; submit(input: Record<string, unknown>, target?: { operation?: string; workflowId?: string }): Promise<{ providerJobId: string }>; getStatus(handle: { providerJobId: string }): Promise<{ status: JobStatus; artifacts: ArtifactRecord[]; rawStatus?: string; startedAt?: number; executionDuration?: number }> };
type RuntimeDeps = { adapters: Map<string, Adapter>; jobs: JobRepository; credentials: { get(adapterId: string): Promise<{ ok: boolean }> }; id: () => string; now?: () => number };
function applyOutputMapping(job: JobRecord, artifacts: ArtifactRecord[]): ArtifactRecord[] {
  const mappings = job.outputMapping?.artifacts ?? [];
  return artifacts.map((artifact, index) => {
    const sourcePath = typeof artifact.metadata?.path === 'string' ? artifact.metadata.path : undefined;
    const mapping = (sourcePath && mappings.find((item) => item.from === sourcePath)) ?? (mappings.length === artifacts.length ? mappings[index] : undefined);
    return mapping ? { ...artifact, kind: mapping.kind, metadata: { ...artifact.metadata, path: mapping.from } } : artifact;
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sameArtifacts(left: ArtifactRecord[], right: ArtifactRecord[]): boolean {
  return stable(left.map(({ jobId: _jobId, ...item }) => item)) === stable(right.map(({ jobId: _jobId, ...item }) => item));
}

export function createWorkflowRuntime(deps: RuntimeDeps) {
  const locks = new Set<string>();
  const now = deps.now ?? Date.now;
  return {
    validateDraft(workflow: WorkflowDefinition, draft: WorkflowDraft): ValidationResult {
      const definition = validateWorkflowDefinition(workflow, { adapters: Array.from(deps.adapters.values()).map((item) => ({ id: item.manifest().id, operations: item.manifest().operations })) });
      if (!definition.ok) return definition;
      return compileWorkflow(workflow, draft.contentHash).validateDraft(draft.inputs);
    },
    preview(workflow: WorkflowDefinition, draft: WorkflowDraft) { return { workflowId: workflow.id, version: workflow.version, contentHash: draft.contentHash, inputs: draft.inputs, sideEffect: 'external-job' as const }; },
    async submit(workflow: WorkflowDefinition, draft: WorkflowDraft, _options: Record<string, unknown> = {}): Promise<JobRecord> {
      const validation = this.validateDraft(workflow, draft); if (!validation.ok) throw new Error(validation.errors.map((item) => item.message).join('; '));
      const adapter = deps.adapters.get(workflow.platform.adapter); if (!adapter) throw new Error('workflow adapter unavailable');
      const credential = await deps.credentials.get(workflow.platform.adapter); if (!credential.ok) throw new Error('workflow credentials unavailable');
      const validated = await adapter.validateCredentials(); if (!validated.ok) throw new Error('workflow credentials unavailable');
      const id = deps.id(); if (locks.has(id)) throw new Error('workflow submission already in progress'); locks.add(id);
      const timestamp = now();
      let job: JobRecord = { id, workflowId: workflow.id, workflowVersion: workflow.version, workflowContentHash: draft.contentHash, adapterId: adapter.manifest().id, adapterVersion: adapter.manifest().adapterVersion, inputSnapshot: draft.inputs, outputMapping: workflow.outputs, status: 'SUBMITTING', createdAt: timestamp, updatedAt: timestamp };
      await deps.jobs.upsert(job);
      try {
        const requestInput = compileWorkflow(workflow, draft.contentHash).buildRequest(draft.inputs);
        const remote = await adapter.submit(requestInput, { operation: workflow.platform.operation, workflowId: workflow.platform.workflowId ?? workflow.id });
        job = { ...job, status: 'QUEUED', remote: { providerJobId: remote.providerJobId }, updatedAt: now() };
        await deps.jobs.upsert(job);
        return job;
      } catch (error) { job = { ...job, status: 'UNKNOWN', error: { code: 'SUBMIT_UNKNOWN', message: error instanceof Error ? error.message : String(error) }, updatedAt: now() }; await deps.jobs.upsert(job); throw error; } finally { locks.delete(id); }
    },
    async sync(job: JobRecord): Promise<JobRecord> {
      const adapter = deps.adapters.get(job.adapterId); if (!adapter || !job.remote?.providerJobId) return job;
      const update = await adapter.getStatus({ providerJobId: job.remote.providerJobId }); const timestamp = now(); const terminal = update.status !== 'QUEUED' && update.status !== 'RUNNING'; const startedAt = update.startedAt ?? job.startedAt ?? (update.status === 'RUNNING' ? timestamp : terminal ? job.createdAt : undefined); const executionDuration = update.executionDuration ?? job.executionDuration ?? (startedAt != null && terminal && timestamp >= startedAt ? (timestamp - startedAt) / 1000 : undefined); const current = { ...job, status: update.status, remote: { ...job.remote, rawStatus: update.rawStatus }, startedAt, executionDuration, updatedAt: timestamp }; const mapped = applyOutputMapping(current, update.artifacts.map((item) => ({ ...item, jobId: job.id }))); const previousArtifacts = await deps.jobs.listArtifacts(job.id); const metadataChanged = job.status !== current.status || job.remote?.rawStatus !== current.remote?.rawStatus || job.startedAt !== current.startedAt || job.executionDuration !== current.executionDuration; if (!metadataChanged && sameArtifacts(previousArtifacts, mapped)) return job; await deps.jobs.upsert(current); if (!sameArtifacts(previousArtifacts, mapped)) await deps.jobs.replaceArtifacts(job.id, mapped); return current;
    },
  };
}
