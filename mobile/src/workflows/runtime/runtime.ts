import type { WorkflowDefinition, WorkflowDraft, ValidationResult } from '../schema/types';
import type { JobRecord, JobRepository, ArtifactRecord } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import { validateWorkflowDefinition } from '../schema/validator';
import { compileWorkflow } from '../compiler/compiler';
import type { ProviderAdapter, ProviderStatusUpdate, ProviderTarget } from '../providers/registry';

type Adapter = Omit<ProviderAdapter, 'manifest'> & { manifest(): Pick<PlatformAdapterManifest, 'id' | 'adapterVersion' | 'operations'> };
type RuntimeDeps = { adapters: Map<string, Adapter>; jobs: JobRepository; credentials: { get(adapterId: string): Promise<{ ok: boolean }> }; id: () => string; now?: () => number };
export type WorkflowProvenance = { workflowId: string; workflowVersion: string; contentHash: string };
type SubmitOptions = { provenance: WorkflowProvenance };
export type PreparedWorkflowSubmission = {
  workflowId: string;
  workflowVersion: string;
  workflowContentHash: string;
  adapterId: string;
  adapterVersion: string;
  inputSnapshot: Record<string, unknown>;
  requestInput: Record<string, unknown>;
  outputMapping?: JobRecord['outputMapping'];
  target: ProviderTarget;
};
export type QueueSubmissionInput = { submissionId: string; workflow: WorkflowDefinition; draft: WorkflowDraft; provenance: WorkflowProvenance };
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
    validateDraft(workflow: WorkflowDefinition, draft: WorkflowDraft, expected?: WorkflowProvenance): ValidationResult {
      if (!expected) return { ok: false, errors: [{ path: 'provenance', code: 'PROVENANCE_REQUIRED', message: 'workflow provenance is required' }] };
      const provenance = expected;
      const mismatches = [
        draft.workflowId !== provenance.workflowId ? 'workflow id does not match active record' : undefined,
        draft.workflowVersion !== provenance.workflowVersion ? 'workflow version does not match active record' : undefined,
        draft.contentHash !== provenance.contentHash ? 'workflow content hash does not match active record' : undefined,
      ].filter((message): message is string => Boolean(message));
      if (mismatches.length) return { ok: false, errors: mismatches.map((message) => ({ path: 'provenance', code: 'PROVENANCE_MISMATCH', message })) };
      const definition = validateWorkflowDefinition(workflow, { adapters: Array.from(deps.adapters.values()).map((item) => ({ id: item.manifest().id, operations: item.manifest().operations })) });
      if (!definition.ok) return definition;
      return compileWorkflow(workflow, draft.contentHash).validateDraft(draft.inputs);
    },
    preview(workflow: WorkflowDefinition, draft: WorkflowDraft) { return { workflowId: workflow.id, version: workflow.version, contentHash: draft.contentHash, inputs: draft.inputs, sideEffect: 'external-job' as const }; },
    prepareSubmission(workflow: WorkflowDefinition, draft: WorkflowDraft, provenance: WorkflowProvenance): PreparedWorkflowSubmission {
      const validation = this.validateDraft(workflow, draft, provenance);
      if (!validation.ok) throw new Error(validation.errors.map((item) => item.message).join('; '));
      const adapter = deps.adapters.get(workflow.platform.adapter);
      if (!adapter) throw new Error('workflow adapter unavailable');
      return {
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        workflowContentHash: draft.contentHash,
        adapterId: adapter.manifest().id,
        adapterVersion: adapter.manifest().adapterVersion,
        inputSnapshot: draft.inputs,
        requestInput: compileWorkflow(workflow, draft.contentHash).buildRequest(draft.inputs),
        outputMapping: workflow.outputs,
        target: { operation: workflow.platform.operation, workflowId: workflow.platform.workflowId ?? workflow.id },
      };
    },
    mapStatus(job: JobRecord, update: ProviderStatusUpdate, timestamp = now()): { job: JobRecord; artifacts: ArtifactRecord[] } {
      const terminal = update.status !== 'QUEUED' && update.status !== 'RUNNING';
      const startedAt = update.startedAt ?? job.startedAt ?? (update.status === 'RUNNING' ? timestamp : terminal ? job.createdAt : undefined);
      const executionDuration = update.executionDuration ?? job.executionDuration ?? (startedAt != null && terminal && timestamp >= startedAt ? (timestamp - startedAt) / 1000 : undefined);
      const current: JobRecord = {
        ...job,
        status: update.status,
        providerHandle: job.providerHandle ? { ...job.providerHandle, ...(update.rawStatus === undefined ? {} : { rawStatus: update.rawStatus }) } : job.providerHandle,
        remote: job.remote ? { ...job.remote, ...(update.rawStatus === undefined ? {} : { rawStatus: update.rawStatus }) } : job.remote,
        startedAt,
        executionDuration,
        updatedAt: timestamp,
      };
      const artifacts = applyOutputMapping(current, update.artifacts.map((item) => ({ ...item, jobId: job.id })));
      return { job: current, artifacts };
    },
    async submit(workflow: WorkflowDefinition, draft: WorkflowDraft, options: SubmitOptions): Promise<JobRecord> {
      const provenance = options?.provenance;
      const validation = this.validateDraft(workflow, draft, provenance); if (!validation.ok) throw new Error(validation.errors.map((item) => item.message).join('; '));
      const adapter = deps.adapters.get(workflow.platform.adapter); if (!adapter) throw new Error('workflow adapter unavailable');
      const credential = await deps.credentials.get(workflow.platform.adapter); if (!credential.ok) throw new Error('workflow credentials unavailable');
      const validated = await adapter.validateCredentials(); if (!validated.ok) throw new Error('workflow credentials unavailable');
      const id = deps.id(); if (locks.has(id)) throw new Error('workflow submission already in progress'); locks.add(id);
      const timestamp = now();
      let job: JobRecord = { id, revision: 0, workflowId: workflow.id, workflowVersion: workflow.version, workflowContentHash: draft.contentHash, adapterId: adapter.manifest().id, adapterVersion: adapter.manifest().adapterVersion, inputSnapshot: draft.inputs, outputMapping: workflow.outputs, status: 'SUBMITTING', createdAt: timestamp, updatedAt: timestamp };
      await deps.jobs.upsert(job);
      try {
        const requestInput = compileWorkflow(workflow, draft.contentHash).buildRequest(draft.inputs);
        const handle = await adapter.submit(requestInput, { operation: workflow.platform.operation, workflowId: workflow.platform.workflowId ?? workflow.id });
        const providerJobId = handle.providerJobId;
        if (typeof providerJobId !== 'string' || !providerJobId) throw new Error('provider returned an invalid job handle');
        job = { ...job, status: 'QUEUED', providerHandle: handle, remote: { providerJobId }, updatedAt: now() };
        await deps.jobs.upsert(job);
        return job;
      } catch (error) { job = { ...job, status: 'UNKNOWN', error: { code: 'SUBMIT_UNKNOWN', message: error instanceof Error ? error.message : String(error) }, updatedAt: now() }; await deps.jobs.upsert(job); throw error; } finally { locks.delete(id); }
    },
    async sync(job: JobRecord): Promise<JobRecord> {
      const adapter = deps.adapters.get(job.adapterId); const handle = job.providerHandle ?? job.remote; if (!adapter || !handle) return job;
      const update = await adapter.getStatus(handle); const { job: current, artifacts: mapped } = this.mapStatus(job, update); const previousArtifacts = await deps.jobs.listArtifacts(job.id); const metadataChanged = job.status !== current.status || job.remote?.rawStatus !== current.remote?.rawStatus || job.startedAt !== current.startedAt || job.executionDuration !== current.executionDuration; if (!metadataChanged && sameArtifacts(previousArtifacts, mapped)) return job; await deps.jobs.upsert(current); if (!sameArtifacts(previousArtifacts, mapped)) await deps.jobs.replaceArtifacts(job.id, mapped); return current;
    },
  };
}
