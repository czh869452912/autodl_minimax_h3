import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import type { CreativeCommand } from './types';

async function fixture() {
  const db = createInitializedRealSqliteTestDb();
  let next = 0;
  const service = createCreativeService(db as never, { id: () => `story-${++next}`, now: () => 100 });
  const execute = async (c: CreativeCommand) => { const r = await service.execute(c, `key-${++next}`); if (r.status !== 'completed') throw new Error('expected completed'); return r.value; };
  const p = await execute({ name: 'project.create', payload: { title: 'Film' } });
  const hash = 'a'.repeat(64); db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'image/png', `cas/${hash}`);
  const asset = await execute({ name: 'asset.import', payload: { title: 'Reference', kind: 'image', blobSha256: hash, projectId: p.projectId } });
  db.runSync("INSERT INTO creative_asset_versions VALUES('v2',?,2,'generated','{}',2)", asset.assetId);
  db.runSync("INSERT INTO creative_version_files VALUES('v2','original',?,'AVAILABLE')", hash);
  const shot = await execute({ name: 'shot.create', payload: { projectId: p.projectId, title: 'Opening' } });
  return { db, service, execute, projectId: p.projectId, asset, shotId: shot.shotId };
}

test('shot selection, project pin and asset default are independent references', async () => {
  const f = await fixture();
  try {
    await f.execute({ name: 'shot.selectOutput', payload: { id: f.shotId, expectedRevision: 0, slot: 'selected_image', versionId: 'v2' } });
    expect((await f.service.shots(f.projectId))[0].selected_image).toBe('v2');
    expect((await f.service.assets())[0].currentVersionId).toBe(f.asset.versionId);
    expect((await f.service.links(f.asset.assetId))[0].pinned_version_id).toBe(f.asset.versionId);
    await f.execute({ name: 'asset.pinProjectVersion', payload: { assetId: f.asset.assetId, projectId: f.projectId, expectedRevision: 0, versionId: null } });
    await f.execute({ name: 'asset.setDefaultVersion', payload: { id: f.asset.assetId, expectedRevision: 0, versionId: 'v2' } });
    await expect(f.execute({ name: 'shot.selectOutput', payload: { id: f.shotId, expectedRevision: 0, slot: 'selected_image', versionId: f.asset.versionId } })).rejects.toThrow('REVISION_CONFLICT');
    expect((await f.service.shots(f.projectId))[0].selected_image).toBe('v2');
    expect((await f.service.links(f.asset.assetId))[0].pinned_version_id).toBeNull();
  } finally { f.db.close(); }
});

test('wrong type or missing file cannot become a selected output; soft deletion preserves provenance', async () => {
  const f = await fixture();
  try {
    await expect(f.execute({ name: 'shot.selectOutput', payload: { id: f.shotId, expectedRevision: 0, slot: 'selected_video', versionId: 'v2' } })).rejects.toThrow('SHOT_VERSION_KIND_MISMATCH');
    f.db.runSync("UPDATE creative_file_resources SET state='MISSING' WHERE version_id='v2'");
    await expect(f.execute({ name: 'shot.selectOutput', payload: { id: f.shotId, expectedRevision: 0, slot: 'selected_image', versionId: 'v2' } })).rejects.toThrow('VERSION_NOT_AVAILABLE');
    await f.execute({ name: 'shot.selectOutput', payload: { id: f.shotId, expectedRevision: 0, slot: 'selected_image', versionId: f.asset.versionId } });
    await f.execute({ name: 'shot.delete', payload: { id: f.shotId, expectedRevision: 1 } });
    expect(await f.service.shots(f.projectId)).toEqual([]);
    expect(f.db.getAllSync('SELECT * FROM creative_shot_assets')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(2);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('reordering validates the full revision set and rolls back every position on receipt failure', async () => {
  const f = await fixture();
  try {
    const second = await f.execute({ name: 'shot.create', payload: { projectId: f.projectId, title: 'Ending' } });
    const shots = [{ id: second.shotId, expectedRevision: 0 }, { id: f.shotId, expectedRevision: 0 }];
    f.db.execSync("CREATE TRIGGER fail_story_receipt BEFORE INSERT ON creative_command_receipts WHEN NEW.command_name='shot.reorder' BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.execute({ name: 'shot.reorder', payload: { projectId: f.projectId, shots } })).rejects.toThrow('injected');
    expect((await f.service.shots(f.projectId)).map(s => s.title)).toEqual(['Opening','Ending']);
    f.db.execSync('DROP TRIGGER fail_story_receipt');
    await f.execute({ name: 'shot.reorder', payload: { projectId: f.projectId, shots } });
    expect((await f.service.shots(f.projectId)).map(s => s.title)).toEqual(['Ending','Opening']);
    await expect(f.execute({ name: 'shot.reorder', payload: { projectId: f.projectId, shots } })).rejects.toThrow('REVISION_CONFLICT');
  } finally { f.db.close(); }
});
