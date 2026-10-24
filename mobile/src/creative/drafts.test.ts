import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import type { CreativeCommand } from './types';
import { defaultNovelAiDraft } from './novelAiProtocol';

async function fixture() {
  const db = createInitializedRealSqliteTestDb(); let seq = 0;
  const service = createCreativeService(db as never, { id: () => `draft-${++seq}`, now: () => 100 });
  const execute = async (command: CreativeCommand, key = `key-${++seq}`) => {
    const result = await service.execute(command, key);
    if (result.status !== 'completed') throw new Error('Expected completed');
    return result.value;
  };
  const { projectId } = await execute({ name: 'project.create', payload: { title: 'Project' } });
  const hash = 'a'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'image/png', `cas/${hash}`);
  const asset = await execute({ name: 'asset.import', payload: { title: 'Image', kind: 'image', blobSha256: hash } });
  const { shotId } = await execute({ name: 'shot.create', payload: { projectId, title: 'Shot', description: 'Camera moves left' } });
  await execute({ name: 'shot.selectOutput', payload: { id: shotId, expectedRevision: 0, slot: 'selected_image', versionId: asset.versionId } });
  return { db, service, execute, projectId, asset, shotId, hash };
}

test('image drafts preserve shot context and reject cross-project creation', async () => {
  const f = await fixture();
  try {
    const { draftId } = await f.execute({ name: 'draft.createImage', payload: { shotId: f.shotId } });
    expect(await f.service.draft(draftId)).toMatchObject({ project_id: f.projectId, shot_id: f.shotId, provider_id: 'novelai' });
    const { projectId } = await f.execute({ name: 'project.create', payload: { title: 'Another project' } });
    await expect(f.execute({ name: 'draft.createImage', payload: { projectId, shotId: f.shotId } })).rejects.toThrow('SHOT_SCOPE_MISMATCH');
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('upscale keeps the source, shot and project and rejects a conflicting project atomically',async()=>{
  const f=await fixture();
  try{
    const {draftId}=await f.execute({name:'draft.createUpscale',payload:{versionId:f.asset.versionId,shotId:f.shotId}});
    expect(await f.service.draft(draftId)).toMatchObject({project_id:f.projectId,shot_id:f.shotId,target_asset_id:f.asset.assetId,state:'EDITING'});
    expect((await f.service.draftInputs(draftId)).map(r=>r.version_id)).toEqual([f.asset.versionId]);
    const {projectId}=await f.execute({name:'project.create',payload:{title:'Other'}});
    await expect(f.execute({name:'draft.createUpscale',payload:{versionId:f.asset.versionId,shotId:f.shotId,projectId}})).rejects.toThrow('SHOT_SCOPE_MISMATCH');
    expect(f.db.getAllSync('SELECT id FROM creative_generation_drafts')).toHaveLength(1);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});

test('draft references are frozen, survive reopening and repeated creation is idempotent', async () => {
  const f = await fixture();
  try {
    const command: CreativeCommand = { name: 'draft.createVideo', payload: { shotId: f.shotId } };
    const created = await f.execute(command, 'create-draft');
    expect(await f.execute(command, 'create-draft')).toEqual(created);
    f.db.runSync("INSERT INTO creative_asset_versions VALUES('new-version',?,2,'generated','{}',2)", f.asset.assetId);
    f.db.runSync("INSERT INTO creative_version_files VALUES('new-version','original',?,'AVAILABLE')", f.hash);
    await f.execute({ name: 'shot.selectOutput', payload: { id: f.shotId, expectedRevision: 1, slot: 'selected_image', versionId: 'new-version' } });
    const reopened = createCreativeService(f.db as never);
    const draft = await reopened.draft(created.draftId);
    expect(draft?.project_id).toBe(f.projectId);
    expect(JSON.parse(draft!.input_json).prompt).toBe('Camera moves left');
    expect((await reopened.draftInputs(created.draftId)).map(r => r.version_id)).toEqual([f.asset.versionId]);
  } finally { f.db.close(); }
});

test('draft edits reject stale revisions and failed input replacements roll back', async () => {
  const f = await fixture();
  try {
    const { draftId } = await f.execute({ name: 'draft.createVideo', payload: { shotId: f.shotId } });
    const input = { schemaVersion: 1 as const, prompt: 'New prompt', resolution: '480p竖' as const, duration: 5, seed: '' };
    await f.execute({ name: 'draft.updateVideo', payload: { id: draftId, expectedRevision: 0, input } });
    await expect(f.execute({ name: 'draft.updateVideo', payload: { id: draftId, expectedRevision: 0, input } })).rejects.toThrow('DRAFT_REVISION_CONFLICT');
    await expect(f.execute({ name: 'draft.replaceInputs', payload: { id: draftId, expectedRevision: 1, versionIds: ['missing'] } })).rejects.toThrow('DRAFT_INPUT_NOT_AVAILABLE');
    expect((await f.service.draftInputs(draftId))[0].version_id).toBe(f.asset.versionId);
    expect((await f.service.draft(draftId))?.revision).toBe(1);
    f.db.execSync("CREATE TRIGGER fail_draft_receipt BEFORE INSERT ON creative_command_receipts WHEN NEW.command_name='draft.discard' BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.execute({ name: 'draft.discard', payload: { id: draftId, expectedRevision: 1 } })).rejects.toThrow('injected');
    expect((await f.service.draft(draftId))?.state).toBe('EDITING');
  } finally { f.db.close(); }
});

test('archived projects, missing files and cross-project shots cannot create executable drafts', async () => {
  const f = await fixture();
  try {
    const { projectId } = await f.execute({ name: 'project.create', payload: { title: 'Other' } });
    await expect(f.execute({ name: 'draft.createVideo', payload: { projectId, shotId: f.shotId } })).rejects.toThrow('SHOT_SCOPE_MISMATCH');
    f.db.runSync("UPDATE creative_file_resources SET state='MISSING' WHERE version_id=?", f.asset.versionId);
    await expect(f.execute({ name: 'draft.createVideo', payload: { versionId: f.asset.versionId } })).rejects.toThrow('DRAFT_INPUT_NOT_AVAILABLE');
    expect(f.db.getAllSync('SELECT * FROM creative_generation_drafts')).toEqual([]);
    f.db.runSync('UPDATE creative_projects SET archived_at=1 WHERE id=?', f.projectId);
    await expect(f.execute({ name: 'draft.createVideo', payload: { projectId: f.projectId } })).rejects.toThrow('PROJECT_NOT_AVAILABLE');
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('image source and mask are atomically pinned to immutable versions across modes and failed saves',async()=>{
  const f=await fixture();
  try{
    const mask=await f.execute({name:'asset.import',payload:{title:'Mask',kind:'image',blobSha256:f.hash}});
    const input={...defaultNovelAiDraft,prompt:'observatory',action:'infill' as const,sourceVersionId:f.asset.versionId,maskVersionId:mask.versionId};
    const {draftId}=await f.execute({name:'draft.createImage',payload:{input}});
    expect((await f.service.draftInputs(draftId)).map(r=>r.version_id)).toEqual([f.asset.versionId,mask.versionId]);
    await expect(f.execute({name:'draft.updateImage',payload:{id:draftId,expectedRevision:0,input:{...input,maskVersionId:'missing'}}})).rejects.toThrow('DRAFT_INPUT_NOT_AVAILABLE');
    expect((await f.service.draftInputs(draftId)).map(r=>r.version_id)).toEqual([f.asset.versionId,mask.versionId]);
    expect((await f.service.draft(draftId))?.revision).toBe(0);
    await f.execute({name:'draft.updateImage',payload:{id:draftId,expectedRevision:0,input:{...input,action:'img2img'}}});
    expect((await f.service.draftInputs(draftId)).map(r=>r.version_id)).toEqual([f.asset.versionId]);
    await f.execute({name:'draft.updateImage',payload:{id:draftId,expectedRevision:1,input:{...input,action:'generate'}}});
    expect(await f.service.draftInputs(draftId)).toEqual([]);
    expect(JSON.parse((await f.service.draft(draftId))!.input_json).sourceVersionId).toBe(f.asset.versionId);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});
