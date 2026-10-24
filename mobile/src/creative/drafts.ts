import { z } from 'zod';
import type { AppDatabase } from '../storage/appDatabase';
import { H3_CREATIVE_WORKFLOW_ID as H3_WORKFLOW_ID } from './videoWorkflow';
import { RESOLUTION_OPTIONS } from '../create/resolutions';
import { novelAiDraftInput, defaultNovelAiDraft, novelAiSourceIds } from './novelAiProtocol';
import {novelAiUpscaleInput} from './novelAiUpscale';
const id = z.string().min(1).max(200), revision = z.number().int().nonnegative();
export const videoDraftInput = z.object({ schemaVersion: z.literal(1).default(1), prompt: z.string().max(10000), resolution: z.enum(RESOLUTION_OPTIONS), duration: z.number().int().min(1).max(15), seed: z.string().regex(/^$|^\d{1,15}$/) }).strict();
export const draftSchemas = {
  'draft.createUpscale':z.object({versionId:id,projectId:id.optional()}).strict(),
  'draft.copySubmitted':z.object({id}).strict(),
  'draft.createImage': z.object({ projectId: id.optional(), shotId: id.optional(), input: novelAiDraftInput.optional(), fromVersionId: id.optional() }).strict(),
  'draft.updateImage': z.object({ id, expectedRevision: revision, input: novelAiDraftInput }).strict(),
  'draft.createVideo': z.object({ projectId: id.optional(), shotId: id.optional(), versionId: id.optional(), prompt: z.string().max(10000).default('') }).strict(),
  'draft.updateVideo': z.object({ id, expectedRevision: revision, input: videoDraftInput }).strict(),
  'draft.replaceInputs': z.object({ id, expectedRevision: revision, versionIds: z.array(id).max(9) }).strict(),
  'draft.discard': z.object({ id, expectedRevision: revision }).strict(),
};
export type DraftCommand = { [K in keyof typeof draftSchemas]: { name: K; payload: z.input<typeof draftSchemas[K]> } }[keyof typeof draftSchemas];
export type CreativeDraft = { id: string; project_id: string | null; shot_id: string | null; target_asset_id: string | null; provider_id: string; workflow_id: string; input_json: string; revision: number; state: string; job_id: string | null };
export function readCreativeDraft(db: AppDatabase, id: string) { return db.getFirstAsync<CreativeDraft>('SELECT * FROM creative_generation_drafts WHERE id=?', id); }
export function readDraftInputs(db: AppDatabase, id: string) { return db.getAllAsync<{ version_id: string; ordinal: number; blob_sha256: string; relative_path: string; mime: string; byte_size: number; state: string }>(`SELECT i.*,f.blob_sha256,f.state,b.relative_path,b.mime,b.byte_size FROM creative_draft_inputs i LEFT JOIN creative_version_files f ON f.version_id=i.version_id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE draft_id=? ORDER BY ordinal`, id); }
export async function applyDraftCommand(tx: AppDatabase, name: string, p: any, now: number, makeId: () => string): Promise<Record<string,string>> {
  if (!(name in draftSchemas)) throw new Error('UNKNOWN_CREATIVE_COMMAND');
  const project = async (id: string | null | undefined) => { if (id && !await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', id)) throw new Error('PROJECT_NOT_AVAILABLE'); };
  const inputs = async (draftId: string, versions: string[]) => {
    for (const [ordinal, versionId] of versions.entries()) {
      if (!await tx.getFirstAsync("SELECT v.id FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id AND a.kind='image' JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE' WHERE v.id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=v.asset_id)", versionId)) throw new Error('DRAFT_INPUT_NOT_AVAILABLE');
      await tx.runAsync("INSERT INTO creative_draft_inputs VALUES(?,'image',?,?)", draftId, ordinal, versionId);
    }
  };
  if(name==='draft.copySubmitted'){
    const source=await readCreativeDraft(tx,p.id);
    if(!source||source.state!=='SUBMITTED'||!source.job_id)throw new Error('SUBMITTED_DRAFT_REQUIRED');
    await project(source.project_id);
    if(source.target_asset_id&&await tx.getFirstAsync('SELECT asset_id FROM creative_asset_trash WHERE asset_id=?',source.target_asset_id))throw new Error('TARGET_ASSET_TRASHED');
    if(source.shot_id&&!await tx.getFirstAsync('SELECT id FROM creative_shots WHERE id=? AND deleted_at IS NULL',source.shot_id))throw new Error('SHOT_NOT_AVAILABLE');
    const draftId=makeId();
    await tx.runAsync("INSERT INTO creative_generation_drafts SELECT ?,project_id,shot_id,target_asset_id,provider_id,workflow_id,input_json,0,'EDITING',NULL,?,? FROM creative_generation_drafts WHERE id=?",draftId,now,now,p.id);
    await tx.runAsync('INSERT INTO creative_draft_inputs SELECT ?,slot,ordinal,version_id FROM creative_draft_inputs WHERE draft_id=?',draftId,p.id);
    return {draftId,provider:source.provider_id,supersedesJobId:source.job_id};
  }
  if(name==='draft.createUpscale'){
    await project(p.projectId??null);
    const version=await tx.getFirstAsync<{asset_id:string}>("SELECT v.asset_id FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id WHERE v.id=? AND a.kind='image' AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)",p.versionId);
    if(!version)throw new Error('IMAGE_VERSION_NOT_FOUND');
    const draftId=makeId(),input=novelAiUpscaleInput.parse({operation:'upscale',sourceVersionId:p.versionId});
    await tx.runAsync("INSERT INTO creative_generation_drafts VALUES(?,?,NULL,?,'novelai','novelai-image-basic',?,0,'EDITING',NULL,?,?)",draftId,p.projectId??null,version.asset_id,JSON.stringify(input),now,now);
    await inputs(draftId,[p.versionId]);
    return {draftId};
  }
  if (name === 'draft.createImage') {
    let projectId = p.projectId ?? null;
    if (p.shotId) {
      const shot = await tx.getFirstAsync<{ project_id: string }>('SELECT project_id FROM creative_shots WHERE id=? AND deleted_at IS NULL', p.shotId);
      if (!shot || (projectId && projectId !== shot.project_id)) throw new Error('SHOT_SCOPE_MISMATCH');
      projectId = shot.project_id;
    }
    await project(projectId);
    let input = p.input ?? defaultNovelAiDraft, assetId: string | null = null;
    if (p.fromVersionId) {
      const version = await tx.getFirstAsync<{ asset_id: string; recipe_json: string }>("SELECT v.* FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id AND a.kind='image' WHERE v.id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)", p.fromVersionId);
      if (!version) throw new Error('IMAGE_VERSION_NOT_FOUND');
      const recipe = JSON.parse(version.recipe_json);
      if (!p.input) input = novelAiDraftInput.parse(recipe.input);
      assetId = version.asset_id;
    }
    const draftId = makeId();
    await tx.runAsync("INSERT INTO creative_generation_drafts VALUES(?,?,?,?,'novelai','novelai-image-basic',?,0,'EDITING',NULL,?,?)", draftId, projectId, p.shotId ?? null, assetId, JSON.stringify(input), now, now);
    if (p.fromVersionId) await tx.runAsync("INSERT INTO creative_draft_inputs VALUES(?,'base',0,?)", draftId, p.fromVersionId);
    const sourceIds = novelAiSourceIds(novelAiDraftInput.parse(input));
    if (sourceIds.length) {
      await tx.runAsync('DELETE FROM creative_draft_inputs WHERE draft_id=?', draftId);
      await inputs(draftId, sourceIds);
    }
    return { draftId };
  }
  if (name === 'draft.createVideo') {
    let projectId = p.projectId ?? null, selectedVersion = p.versionId;
    let prompt = p.prompt;
    if (p.shotId) {
      const shot = await tx.getFirstAsync<{ project_id: string; description: string; selected_image: string | null }>("SELECT s.*,(SELECT version_id FROM creative_shot_assets WHERE shot_id=s.id AND slot='selected_image') AS selected_image FROM creative_shots s WHERE id=? AND deleted_at IS NULL", p.shotId);
      if (!shot || (projectId && projectId !== shot.project_id)) throw new Error('SHOT_SCOPE_MISMATCH');
      projectId = shot.project_id; selectedVersion ??= shot.selected_image; prompt ||= shot.description;
    }
    await project(projectId);
    const draftId = makeId();
    await tx.runAsync("INSERT INTO creative_generation_drafts VALUES(?,?,?,NULL,'autodl',?,?,0,'EDITING',NULL,?,?)", draftId, projectId, p.shotId ?? null, H3_WORKFLOW_ID, JSON.stringify({ schemaVersion: 1, prompt, resolution: '480p竖', duration: 5, seed: '' }), now, now);
    if (selectedVersion) await inputs(draftId, [selectedVersion]);
    return { draftId };
  }
  const draft = await readCreativeDraft(tx, p.id);
  if(await tx.getFirstAsync("SELECT s.id FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id WHERE s.draft_id=? AND p.state IN ('ACTIVE','QUARANTINED')",p.id))throw new Error('PLAN_DRAFT_FROZEN');
  if (!draft || draft.revision !== p.expectedRevision || draft.state !== 'EDITING') throw new Error('DRAFT_REVISION_CONFLICT');
  await project(draft.project_id);
  if (name === 'draft.updateVideo' || name === 'draft.updateImage') {
    if (draft.provider_id !== (name === 'draft.updateVideo' ? 'autodl' : 'novelai')) throw new Error('DRAFT_PROVIDER_MISMATCH');
    if(JSON.parse(draft.input_json).operation==='upscale')throw new Error('UPSCALE_DRAFT_IMMUTABLE');
    if (name === 'draft.updateImage') {
      const previous = novelAiSourceIds(novelAiDraftInput.parse(JSON.parse(draft.input_json)));
      const next = novelAiSourceIds(p.input);
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        await tx.runAsync('DELETE FROM creative_draft_inputs WHERE draft_id=?', p.id);
        await inputs(p.id, next);
      }
    }
    await tx.runAsync('UPDATE creative_generation_drafts SET input_json=?,revision=revision+1,updated_at=? WHERE id=?', JSON.stringify(p.input), now, p.id);
  } else if (name === 'draft.replaceInputs') {
    await tx.runAsync('DELETE FROM creative_draft_inputs WHERE draft_id=?', p.id);
    await inputs(p.id, p.versionIds);
    await tx.runAsync('UPDATE creative_generation_drafts SET revision=revision+1,updated_at=? WHERE id=?', now, p.id);
  } else await tx.runAsync("UPDATE creative_generation_drafts SET state='DISCARDED',revision=revision+1,updated_at=? WHERE id=?", now, p.id);
  return { draftId: p.id };
}
