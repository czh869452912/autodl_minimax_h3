import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { executeCreativeExport } from './exportExecution';
import { quarantineRestoredExecution } from '../storage/restoreIsolation';

async function fixture(mime='image/png',kind:'image'|'video'|'audio'|'document'='image') {
  const db = createInitializedRealSqliteTestDb(); db.execSync('PRAGMA foreign_keys=ON');
  let next = 0, now = 100;
  const hash = 'a'.repeat(64);
  const service = createCreativeService(db as never, { id: () => `export-${++next}`, now: () => now });
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, mime, `cas/${hash}`);
  const imported = await service.execute({ name: 'asset.import', payload: { title: 'standalone', kind, blobSha256: hash } }, 'import');
  if (imported.status !== 'completed') throw new Error('expected import');
  const command = { name: 'asset.export' as const, payload: { versionId: imported.value.versionId } };
  const result = await service.execute(command, 'save');
  if (result.status !== 'accepted' || result.execution.kind !== 'export') throw new Error('expected export');
  const operations = createOperationRepository(db as never);
  const opId = result.execution.operationId;
  const deps = { now: () => now, verify: jest.fn(async () => true), lookup: jest.fn(async (): Promise<string | null> => 'content://saved'), publish: jest.fn(async () => 'content://saved') };
  const claim = async () => { const op = await operations.claimById(opId, 'worker', now, 500); if (!op) throw new Error('no claim'); return op; };
  const run = async () => executeCreativeExport(db as never, await claim(), 'worker', deps);
  const status = () => db.getFirstSync<{ status: string }>('SELECT status FROM creative_deliveries')?.status;
  return { db, service, command, result, operations, deps, claim, run, status, opId, advance: () => { now += 1000; } };
}

test('standalone export uses no job; repeated commands and scheduler wakes publish once', async () => {
  const f = await fixture();
  try {
    expect(await f.service.execute(f.command, 'save')).toEqual(f.result);
    const duplicate = await f.service.execute(f.command, 'another-key');
    expect(duplicate).toMatchObject({ status: 'accepted', execution: f.result.execution });
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);
    expect(f.db.getAllSync('SELECT * FROM tasks')).toEqual([]);
    expect(f.db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(1);
    const op = await f.claim();
    await executeCreativeExport(f.db as never, op, 'worker', f.deps);
    await executeCreativeExport(f.db as never, op, 'worker', f.deps);
    expect(f.deps.publish).toHaveBeenCalledTimes(1);
    expect(f.status()).toBe('EXPORTED');
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_delivery'")).toEqual([]);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
  } finally { f.db.close(); }
});

test.each([['video/mp4','video','system-gallery'],['audio/mpeg','audio','system-downloads'],['application/pdf','document','system-downloads'],['text/plain','document','system-downloads']] as const)('standalone %s export requires no generation task and preserves its original',async(mime,kind,target)=>{
  const f=await fixture(mime,kind);try{
    expect(f.db.getFirstSync('SELECT target FROM creative_deliveries')).toEqual({target});
    await f.run();expect(f.status()).toBe('EXPORTED');
    expect(f.deps.publish).toHaveBeenCalledWith(expect.any(String),expect.any(String),mime,'a'.repeat(64));
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
  }finally{f.db.close();}
});

test.each([true, false])('lost receipt recovers via lookup only (found=%s)', async found => {
  const f = await fixture();
  try {
    f.db.execSync("CREATE TRIGGER fail_receipt BEFORE UPDATE OF status ON creative_deliveries WHEN NEW.status='EXPORTED' BEGIN SELECT RAISE(ABORT,'receipt lost'); END");
    await expect(f.run()).rejects.toThrow('receipt lost');
    expect(f.status()).toBe('PUBLISHING');
    f.db.execSync('DROP TRIGGER fail_receipt');
    f.advance();
    await f.operations.recoverExpired(f.deps.now(), 10);
    f.deps.lookup.mockResolvedValueOnce(found ? 'content://saved' : null);
    await f.run();
    expect(f.status()).toBe(found ? 'EXPORTED' : 'DELIVERY_UNKNOWN');
    expect(f.deps.publish).toHaveBeenCalledTimes(1);
    expect((await f.operations.get(f.opId))?.state).toBe(found ? 'SUCCEEDED' : 'BLOCKED');
  } finally { f.db.close(); }
});

test('native uncertain failure is blocked instead of retried', async () => {
  const f = await fixture();
  try {
    f.deps.publish.mockRejectedValueOnce(new Error('timeout after external write'));
    await f.run();
    f.advance(); await f.operations.recoverExpired(f.deps.now(), 10);
    expect(await f.operations.listDue({ kind: 'EXPORT', now: f.deps.now(), limit: 10 })).toEqual([]);
    expect(f.status()).toBe('DELIVERY_UNKNOWN');
  } finally { f.db.close(); }
});

test('missing source records unavailability without publishing or changing version selection', async () => {
  const f = await fixture();
  try {
    f.deps.verify.mockResolvedValueOnce(false);
    await f.run();
    expect(f.status()).toBe('FAILED'); expect(f.deps.publish).not.toHaveBeenCalled();
    expect(f.db.getFirstSync('SELECT state FROM creative_version_files')).toEqual({ state: 'MISSING' });
    expect(f.db.getFirstSync('SELECT current_version_id FROM creative_assets')).toEqual({ current_version_id: f.command.payload.versionId });
  } finally { f.db.close(); }
});

test('restoring a queued snapshot quarantines export and rejects old worker', async () => {
  const f = await fixture();
  try {
    const op = await f.claim();
    quarantineRestoredExecution(f.db as never, 'b'.repeat(32));
    await executeCreativeExport(f.db as never, op, 'worker', f.deps);
    expect(f.deps.publish).not.toHaveBeenCalled(); expect(f.deps.lookup).not.toHaveBeenCalled();
    expect(f.status()).toBe('QUARANTINED');
    expect((await f.operations.get(f.opId))?.state).toBe('BLOCKED');
  } finally { f.db.close(); }
});


test('asset trashed during file verification never crosses the publication boundary',async()=>{
  const f=await fixture();try{
    f.deps.verify.mockImplementationOnce(async()=>{
      const asset=f.db.getFirstSync<{id:string;revision:number}>('SELECT id,revision FROM creative_assets')!;
      await f.service.execute({name:'asset.trash',payload:{id:asset.id,expectedRevision:asset.revision}},'trash-during-export');
      return true;
    });
    await f.run();expect(f.status()).toBe('FAILED');
    expect(f.deps.publish).not.toHaveBeenCalled();
    expect(f.db.getFirstSync('SELECT error_code FROM creative_deliveries')).toEqual({error_code:'EXPORT_ASSET_TRASHED'});
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_delivery'")).toHaveLength(0);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
  }finally{f.db.close();}
});
