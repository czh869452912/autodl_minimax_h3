import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { createFileResources } from './fileResources';

async function fixture() {
  const db = createInitializedRealSqliteTestDb();
  let now = 1000;
  const hash = 'a'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'image/png', `cas/${hash}`);
  const service = createCreativeService(db as never);
  const result = await service.execute({ name: 'asset.import', payload: { title: 'original', kind: 'image', blobSha256: hash, sourceUri: 'content://picked/original' } }, 'import');
  if (result.status !== 'completed') throw new Error('expected imported');
  const versionId = result.value.versionId;
  const verify = jest.fn(async () => false);
  const files = createFileResources(db as never, { now: () => now, verify });
  const release = jest.fn(async () => undefined);
  const source = { sourceUri: 'file:///picked.png', importFile: jest.fn(async () => { verify.mockResolvedValue(true); return { hash, release }; }) };
  return { db, hash, service, versionId, files, verify, source, release, age: () => { now += 600001; } };
}

test('missing bytes preserve immutable version, ownership and ephemeral source record', async () => {
  const f = await fixture();
  try {
    expect((await f.files.verify(f.versionId))?.state).toBe('MISSING');
    expect((await f.service.versions((await f.service.assets())[0].id))[0].state).toBe('MISSING');
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(1);
    expect(f.db.getFirstSync('SELECT persisted_permission FROM creative_recovery_sources')).toEqual({ persisted_permission: 0 });
    expect(f.source.importFile).not.toHaveBeenCalled();
  } finally { f.db.close(); }
});

test('reselected identical image restores availability and records a completed attempt', async () => {
  const f = await fixture();
  try {
    await f.files.verify(f.versionId);
    await f.files.restore(f.versionId, f.source);
    expect((await f.files.read(f.versionId))?.state).toBe('AVAILABLE');
    expect(f.db.getFirstSync('SELECT state FROM creative_version_files')).toEqual({ state: 'AVAILABLE' });
    expect(f.db.getFirstSync('SELECT state FROM creative_file_attempts')).toEqual({ state: 'SUCCEEDED' });
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('different content cannot replace a historical version or its expected hash', async () => {
  const f = await fixture();
  try {
    f.source.importFile.mockImplementationOnce(async () => ({ hash: 'b'.repeat(64), release: f.release }));
    await expect(f.files.restore(f.versionId, f.source)).rejects.toThrow('RESTORE_CONTENT_MISMATCH');
    expect(await f.files.read(f.versionId)).toMatchObject({ state: 'MISSING', expected_sha256: f.hash, blob_sha256: f.hash });
    expect(f.db.getFirstSync('SELECT error_code FROM creative_file_attempts')).toEqual({ error_code: 'RESTORE_CONTENT_MISMATCH' });
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(() => f.db.runSync("UPDATE creative_file_resources SET expected_sha256=?", 'b'.repeat(64))).toThrow('RESOURCE_HASH_IMMUTABLE');
  } finally { f.db.close(); }
});

test('simultaneous restore is rejected; verification never cancels a live copy', async () => {
  const f = await fixture();
  let resume!: () => void;
  try {
    const gate = new Promise<void>(resolve => { resume = resolve; });
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const first = f.files.restore(f.versionId, { ...f.source, importFile: async () => { started(); await gate; return f.source.importFile(); } });
    await began;
    expect((await f.files.verify(f.versionId))?.state).toBe('RESTORING');
    await expect(f.files.restore(f.versionId, f.source)).rejects.toThrow('RESTORE_IN_PROGRESS');
    resume(); await first;
    expect(f.db.getAllSync('SELECT * FROM creative_file_attempts')).toHaveLength(1);
  } finally { resume?.(); f.db.close(); }
});

test.each([true, false])('interrupted copy reconciles local bytes without refetching (present=%s)', async present => {
  const f = await fixture();
  try {
    const resource = await f.files.read(f.versionId);
    f.db.runSync("UPDATE creative_file_resources SET state='RESTORING',updated_at=1000 WHERE id=?", resource!.id);
    f.db.runSync("INSERT INTO creative_file_attempts(id,resource_id,state,started_at) VALUES('old',?,'RESTORING',1000)", resource!.id);
    f.age(); f.verify.mockResolvedValue(present);
    expect((await f.files.verify(f.versionId))?.state).toBe(present ? 'AVAILABLE' : 'MISSING');
    expect(f.db.getFirstSync('SELECT state FROM creative_file_attempts')).toEqual({ state: present ? 'SUCCEEDED' : 'FAILED' });
    expect(f.source.importFile).not.toHaveBeenCalled();
  } finally { f.db.close(); }
});
