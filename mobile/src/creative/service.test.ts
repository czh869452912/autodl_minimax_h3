import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';

function fixture() {
  const db = createInitializedRealSqliteTestDb(); db.execSync('PRAGMA foreign_keys=ON');
  let next = 0;
  const service = createCreativeService(db as never, { id: () => `id-${++next}`, now: () => 100 });
  const blob = 'a'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', blob, 'image/png', `cas/sha256/aa/${blob}`);
  const project = async (title = 'project', key = title) => {
    const r = await service.execute({ name: 'project.create', payload: { title } }, key);
    if (r.status !== 'completed') throw new Error('expected completed');
    return r.value.projectId;
  };
  const image = async (projectId?: string) => {
    const r = await service.execute({ name: 'asset.import', payload: { title: 'image', kind: 'image', blobSha256: blob, ...(projectId ? { projectId } : {}) } }, `import-${++next}`);
    if (r.status !== 'completed') throw new Error('expected completed');
    return r.value;
  };
  return { db, service, blob, project, image };
}

test('commands are idempotent, conflict on reused keys and reject stale revisions', async () => {
  const f = fixture();
  try {
    const id = await f.project();
    expect(await f.project()).toBe(id);
    await expect(f.project('different', 'project')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await f.service.execute({ name: 'project.update', payload: { id, title: 'edited', brief: 'brief', expectedRevision: 0 } }, 'edit');
    await expect(f.service.execute({ name: 'project.archive', payload: { id, archived: true, expectedRevision: 0 } }, 'stale')).rejects.toThrow('REVISION_CONFLICT');
    expect((await f.service.projects())[0]).toMatchObject({ title: 'edited', brief: 'brief', revision: 1 });
    expect(f.db.getAllSync('SELECT * FROM creative_command_receipts')).toHaveLength(2);
  } finally { f.db.close(); }
});

test('shared blobs keep separate assets; removing a project link preserves the asset and file pin', async () => {
  const f = fixture();
  try {
    const p1 = await f.project(), p2 = await f.project('second');
    const a = await f.image(p1), b = await f.image();
    await f.service.execute({ name: 'asset.linkToProject', payload: { projectId: p2, assetId: a.assetId, versionId: a.versionId } }, 'link');
    await f.service.execute({ name: 'asset.unlinkFromProject', payload: { projectId: p1, assetId: a.assetId, expectedRevision: 0 } }, 'unlink');
    expect(await f.service.assets({ projectId: p1 })).toEqual([]);
    expect((await f.service.assets({ projectId: p2 }))[0].id).toBe(a.assetId);
    expect((await f.service.assets({ inbox: true }))[0].id).toBe(b.assetId);
    expect(f.db.getAllSync('SELECT * FROM artifact_blobs')).toHaveLength(1);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(2);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('a new candidate never changes default or project pin; setting default leaves pin fixed', async () => {
  const f = fixture();
  try {
    const p = await f.project(), a = await f.image(p);
    f.db.runSync("INSERT INTO creative_asset_versions VALUES('v2',?,2,'generated','{}',2)", a.assetId);
    f.db.runSync("INSERT INTO creative_version_files VALUES('v2','original',?,'AVAILABLE')", f.blob);
    expect((await f.service.assets())[0].currentVersionId).toBe(a.versionId);
    await f.service.execute({ name: 'asset.setDefaultVersion', payload: { id: a.assetId, versionId: 'v2', expectedRevision: 0 } }, 'default');
    expect((await f.service.assets())[0].currentVersionId).toBe('v2');
    expect((await f.service.links(a.assetId))[0].pinned_version_id).toBe(a.versionId);
    const b = await f.image();
    await expect(f.service.execute({ name: 'asset.setDefaultVersion', payload: { id: b.assetId, versionId: 'v2', expectedRevision: 0 } }, 'wrong')).rejects.toThrow('VERSION_NOT_AVAILABLE');
  } finally { f.db.close(); }
});

test('receipt failure rolls back the entire import and file ownership', async () => {
  const f = fixture();
  try {
    f.db.execSync("CREATE TRIGGER fail_receipt BEFORE INSERT ON creative_command_receipts BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.image()).rejects.toThrow('injected');
    expect(await f.service.assets()).toEqual([]);
    expect(f.db.getAllSync('SELECT * FROM artifact_blob_refs')).toEqual([]);
    expect(f.db.getAllSync('SELECT * FROM creative_execution_origins')).toEqual([]);
  } finally { f.db.close(); }
});

test('asset type filtering precedes the page limit, so older matching assets remain discoverable', async () => {
 const f = fixture();
 try {
  for (let i=0;i<105;i++) f.db.runSync('INSERT INTO creative_assets VALUES(?,?,?,NULL,0,?,?)', `a-${i}`, i===0?'video':'image', `Asset ${i}`, i, i);
  expect((await f.service.assets()).length).toBe(100);
  expect((await f.service.assets({kind:'video'})).map(a=>a.id)).toEqual(['a-0']);
  expect((await f.service.assets({kind:'image',limit:200})).length).toBe(104);
 } finally { f.db.close(); }
});
