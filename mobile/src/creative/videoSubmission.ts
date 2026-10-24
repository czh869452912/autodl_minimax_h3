import { creativeVideoWorkflowId } from './videoWorkflow';
import CryptoJS from 'crypto-js';
import type { AppDatabase } from '../storage/appDatabase';
import type { PreparedWorkflowSubmission } from '../workflows/runtime/runtime';
import type { TaskMediaInput } from '../media/types';
import { persistSubmissionCommand } from '../create/submissionCommand';
import { reserveCreativeBudget } from './budget';
import { readCreativeDraft, readDraftInputs } from './drafts';
import { createId } from '../ids';
import { assertCreativeAgentScope, type CreativeAgentOrigin } from './agentScope';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { checkPlanSubmission, recordPlanSubmission } from './planDispatch';

/** Read-only replay: never re-prepare a random seed or resurrect a restored job. */
export async function readSubmittedCreativeDraft(db: AppDatabase, draftId: string, authorizationId: string, origin: CreativeAgentOrigin) {
  return withWriteTransaction(db, async tx => {
    await assertCreativeAgentScope(tx, origin);
    const draft = await readCreativeDraft(tx, draftId);
    if (!origin.projectId || draft?.project_id !== origin.projectId) throw new Error('AGENT_PROJECT_SCOPE_MISMATCH');
    if (draft.state !== 'SUBMITTED') return null;
    const binding = await tx.getFirstAsync<{ job_id: string; authorization_id: string }>(
      'SELECT c.job_id,r.authorization_id FROM creative_job_contexts c JOIN creative_budget_reservations r ON r.id=c.reservation_id WHERE c.job_id=? AND c.draft_id=? AND c.project_id=?', draft.job_id, draftId, origin.projectId);
    if (!binding || binding.authorization_id !== authorizationId) throw new Error('SUBMISSION_AUTHORIZATION_CONFLICT');
    return binding.job_id;
  });
}

export const creativeRequestHash = (prepared: PreparedWorkflowSubmission) => CryptoJS.SHA256(JSON.stringify(prepared)).toString();
export async function submitCreativeVideo(db: AppDatabase, input: {
  draftId: string; expectedRevision: number; draftInputJson: string; authorizationId: string;
  prepared: PreparedWorkflowSubmission; images: TaskMediaInput[]; versionIds: string[];
  sourceManifest?: Array<{ versionId: string; sha256: string; state: string }>;
  origin?: CreativeAgentOrigin;
  planStepId?: string;
}, now = Date.now()) {
  const image = input.prepared.adapterId === 'novelai-image';
  const commandId = `creative-${image ? 'image' : 'video'}:${input.draftId}:${input.expectedRevision}`;
  const requestHash = creativeRequestHash(input.prepared);
  return persistSubmissionCommand(db, commandId, input.prepared, { images: input.images, audios: [] }, now, async (tx, job, inserted) => {
    if (input.origin) await assertCreativeAgentScope(tx, input.origin);
    await checkPlanSubmission(tx,input.draftId,input.planStepId,input.authorizationId,job.id,inserted);
    if (!inserted) {
      const old = await tx.getFirstAsync<{ request_hash: string; project_id: string | null; authorization_id: string }>('SELECT c.request_hash,c.project_id,r.authorization_id FROM creative_job_contexts c JOIN creative_budget_reservations r ON r.id=c.reservation_id WHERE c.job_id=?', job.id);
      if (!old || old.request_hash !== requestHash || old.authorization_id !== input.authorizationId) throw new Error('SUBMISSION_IDEMPOTENCY_CONFLICT');
      if (input.origin && (!input.origin.projectId || old.project_id !== input.origin.projectId)) throw new Error('AGENT_PROJECT_SCOPE_MISMATCH');
      return;
    }
    const draft = await readCreativeDraft(tx, input.draftId);
    if (input.origin && (!input.origin.projectId || draft?.project_id !== input.origin.projectId)) throw new Error('AGENT_PROJECT_SCOPE_MISMATCH');
    if (!draft || draft.revision !== input.expectedRevision || draft.state !== 'EDITING' || draft.input_json !== input.draftInputJson) throw new Error('DRAFT_REVISION_CONFLICT');
    if (draft.provider_id !== (image ? 'novelai' : 'autodl') || (image ? draft.workflow_id : creativeVideoWorkflowId(draft.workflow_id)) !== input.prepared.workflowId) throw new Error('DRAFT_PROVIDER_MISMATCH');
    if (draft.project_id && !await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', draft.project_id)) throw new Error('PROJECT_NOT_AVAILABLE');
    if (draft.target_asset_id && await tx.getFirstAsync('SELECT asset_id FROM creative_asset_trash WHERE asset_id=?', draft.target_asset_id)) throw new Error('TARGET_ASSET_TRASHED');
    if (draft.shot_id && !await tx.getFirstAsync('SELECT id FROM creative_shots WHERE id=? AND deleted_at IS NULL', draft.shot_id)) throw new Error('SHOT_NOT_AVAILABLE');
    const refs = await readDraftInputs(tx, draft.id);
    if (input.sourceManifest && JSON.stringify(refs.map(r => ({ versionId: r.version_id, sha256: r.blob_sha256, state: r.state }))) !== JSON.stringify(input.sourceManifest)) throw new Error('DRAFT_INPUT_CHANGED');
    if (JSON.stringify(refs.map(r => r.version_id)) !== JSON.stringify(input.versionIds) || (!image && (refs.some((r, i) => r.state !== 'AVAILABLE' || r.blob_sha256 !== input.images[i]?.sha256) || refs.length !== input.images.length))) throw new Error('DRAFT_INPUT_CHANGED');
    const reservation = await reserveCreativeBudget(tx, { authorizationId: input.authorizationId, commandId, jobId: job.id, requestHash,
      projectId: draft.project_id ?? undefined, provider: image ? 'novelai' : 'autodl', operation: image ? 'image.generate' : 'video.generate', requestUnits: 1,
      estimate: { maximum: null, unit: image ? 'anlas' : 'autodl_points', requestHash, validUntil: now + 15 * 60_000 } }, now);
    const assetId = draft.target_asset_id ?? createId();
    if (draft.target_asset_id) {
      if (!await tx.getFirstAsync('SELECT id FROM creative_assets WHERE id=? AND kind=?', assetId, image ? 'image' : 'video')) throw new Error('TARGET_ASSET_KIND_MISMATCH');
    } else await tx.runAsync('INSERT INTO creative_assets VALUES(?,?,?,NULL,0,?,?)', assetId, image ? 'image' : 'video', image ? 'NovelAI 图片' : 'H3 视频', now, now);
    if (draft.project_id) await tx.runAsync('INSERT OR IGNORE INTO creative_project_assets VALUES(?,?,NULL,0)', draft.project_id, assetId);
    await tx.runAsync('INSERT INTO creative_job_contexts VALUES(?,?,?,?,?,?,?,?,?,?,?)', job.id, draft.id, draft.revision, draft.project_id, draft.shot_id, assetId, JSON.stringify(input.prepared.inputSnapshot), requestHash, reservation.id, reservation.execution_epoch, now);
    for (const ref of refs) await tx.runAsync('INSERT INTO creative_job_inputs VALUES(?,?,?,?)', job.id, image ? 'base' : 'image', ref.ordinal, ref.version_id);
    await tx.runAsync("UPDATE creative_generation_drafts SET state='SUBMITTED',revision=revision+1,job_id=?,target_asset_id=?,updated_at=? WHERE id=?", job.id, assetId, now, draft.id);
    const originId = createId(), receiptId = createId();
    const lineage = await tx.getFirstAsync<{ namespace: string }>('SELECT namespace FROM creative_lineage WHERE id=1');
    if (!lineage) throw new Error('SOURCE_NAMESPACE_MISSING');
    const commandName = image ? 'draft.submitImage' : 'draft.submitVideo';
    await tx.runAsync('INSERT INTO creative_execution_origins VALUES(?,?,?,?,?,?,?,?)', originId, input.origin ? 'agent' : 'user', lineage.namespace, input.origin?.threadId ?? null, input.origin?.runId ?? null, input.origin?.toolCallId ?? null, commandName, now);
    await tx.runAsync('INSERT INTO creative_command_receipts VALUES(?,?,?,?,?,?,?,?)', receiptId, commandId, commandName, requestHash, originId, reservation.execution_epoch, JSON.stringify({ status: 'accepted', receiptId, execution: { kind: 'generation', jobId: job.id } }), now);
    if(input.planStepId)await recordPlanSubmission(tx,input.planStepId,job.id,now);
  });
}
