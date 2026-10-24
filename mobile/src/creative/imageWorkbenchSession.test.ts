import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { defaultNovelAiDraft } from './novelAiProtocol';
import { persistImageWorkbenchInput } from './imageWorkbenchSession';

let mockService: ReturnType<typeof createCreativeService>;
jest.mock('./runtime', () => ({ creativeService: () => mockService }));

async function fixture() {
  const db = createInitializedRealSqliteTestDb();
  let sequence = 0;
  mockService = createCreativeService(db as never, { id: () => `canvas-${++sequence}`, now: () => 100 });
  const execute = async (command: Parameters<typeof mockService.execute>[0]) => {
    const result = await mockService.execute(command, `command-${++sequence}`);
    if (result.status !== 'completed') throw new Error('Expected completed');
    return result.value;
  };
  const { projectId } = await execute({ name: 'project.create', payload: { title: 'Canvas project' } });
  const { shotId } = await execute({ name: 'shot.create', payload: { projectId, title: 'Shot' } });
  const hash = 'a'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'image/png', `cas/${hash}`);
  const asset = await execute({ name: 'asset.import', payload: { title: 'Source', kind: 'image', blobSha256: hash } });
  const input = { ...defaultNovelAiDraft, prompt: 'original', action: 'img2img' as const, sourceVersionId: asset.versionId };
  const { draftId } = await execute({ name: 'draft.createImage', payload: { input, projectId, shotId, fromVersionId: asset.versionId } });
  db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES('job','image','1','hash','novelai','1',?,'SUCCEEDED',1,1)", JSON.stringify(input));
  db.runSync("UPDATE creative_generation_drafts SET state='SUBMITTED',job_id='job' WHERE id=?", draftId);
  const draft = (await mockService.draft(draftId))!;
  return { db, execute, draft, input, asset };
}

test('repeat generation forks the immutable submission and preserves target, project, shot and source', async () => {
  const f = await fixture();
  try {
    const adopted = jest.fn(), input = { ...f.input, prompt: 'next variation', samples: 4 };
    const next = await persistImageWorkbenchInput(f.draft, input, adopted);
    expect(next).toMatchObject({ state: 'EDITING', job_id: null, project_id: f.draft.project_id, shot_id: f.draft.shot_id, target_asset_id: f.draft.target_asset_id });
    expect(next.id).not.toBe(f.draft.id);
    expect(JSON.parse(next.input_json)).toEqual(input);
    expect(await mockService.draft(f.draft.id)).toEqual(f.draft);
    expect((await mockService.draftInputs(next.id)).map(v => v.version_id)).toEqual([f.asset.versionId]);
    expect(adopted).toHaveBeenLastCalledWith(next);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('a stale screen cannot fork a submission or overwrite the newer input', async () => {
  const f = await fixture();
  try {
    const draft = await persistImageWorkbenchInput(f.draft, f.input, () => undefined);
    await persistImageWorkbenchInput(draft, { ...f.input, prompt: 'other editor' }, () => undefined);
    const adopted = jest.fn();
    await expect(persistImageWorkbenchInput(draft, { ...f.input, prompt: 'stale' }, adopted)).rejects.toThrow('其他入口更新');
    expect(adopted).not.toHaveBeenCalled();
    expect(JSON.parse((await mockService.draft(draft.id))!.input_json).prompt).toBe('other editor');
    expect(f.db.getAllSync('SELECT id FROM creative_generation_drafts')).toHaveLength(2);
  } finally { f.db.close(); }
});

test('switching from standalone upscale back to generation preserves the asset without mutating upscale input', async () => {
  const f = await fixture();
  try {
    const { draftId } = await f.execute({ name: 'draft.createUpscale', payload: { versionId: f.asset.versionId, projectId: f.draft.project_id! } });
    const upscale = (await mockService.draft(draftId))!;
    const next = await persistImageWorkbenchInput(upscale, defaultNovelAiDraft, () => undefined, f.asset.versionId);
    expect(next).toMatchObject({ provider_id: 'novelai', state: 'EDITING', project_id: upscale.project_id, target_asset_id: upscale.target_asset_id });
    expect(JSON.parse(next.input_json)).toEqual(defaultNovelAiDraft);
    expect(await mockService.draft(upscale.id)).toEqual(upscale);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});
