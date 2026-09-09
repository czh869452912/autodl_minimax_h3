import type { WorkflowDefinition, WorkflowDraft, ValidationResult } from '../schema/types';
import type { JobRecord, ArtifactRecord } from '../../jobs/types';
import type { PlatformAdapterManifest } from '../schema/types';
import { validateWorkflowDefinition } from '../schema/validator';
import { compileWorkflow } from '../compiler/compiler';
import type { ProviderAdapter, ProviderStatusUpdate, ProviderTarget } from '../providers/registry';

type Adapter = Omit<ProviderAdapter, 'manifest'> & { manifest(): Pick<PlatformAdapterManifest, 'id' | 'adapterVersion' | 'operations'> };
type RuntimeDeps = { adapters: Map<string, Adapter>; now?: () => number };
export type WorkflowProvenance = { workflowId: string; workflowVersion: string; contentHash: string };
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

export function createWorkflowRuntime(deps: RuntimeDeps) {
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
  };
}
