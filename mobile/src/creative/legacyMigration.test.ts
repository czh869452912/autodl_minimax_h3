import {createSqliteMediaStore} from '../media/repository';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { migrateLegacyCreativeBatch } from './legacyMigration';
import { createCreativeCapture } from '../storage/creativeCapture';

function fixture() {
  const db = createInitializedRealSqliteTestDb();
  const insert = (id: string) => db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,artifact_id,kind) VALUES(?,?,'Old film','Prompt','','video/mp4','downloaded',1,1,'clip','video')", id, `job-${id}`);
  const hash = 'c'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'video/mp4', `cas/${hash}`);
  const retain = (id: string) => db.runSync("INSERT INTO artifact_blob_refs VALUES(?,'workflow_artifact',?,1)", hash, `job-${id}:clip`);
  const migrate = async () => { for (let i=0; i<30; i++) if (!(await migrateLegacyCreativeBatch(db as never, {}, 1)).pending) return; throw new Error('Did not converge'); };
  return { db, insert, retain, migrate, hash, service: createCreativeService(db as never) };
}

test('bounded migration resumes across instances and retains shared content only once per version', async () => {
  const f = fixture();
  try {
    f.insert('a'); f.retain('a'); f.insert('b'); f.retain('b');
    await migrateLegacyCreativeBatch(f.db as never, {}, 1);
    await f.migrate(); await f.migrate();
    expect(await f.service.assets({ inbox: true })).toHaveLength(2);
    expect(f.db.getAllSync('SELECT * FROM artifact_blobs')).toHaveLength(1);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(2);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('deleted legacy media cannot reappear from delayed snapshots or repeated migration', async () => {
  const f = fixture();
  try {
    f.insert('a'); f.retain('a');
    await createCreativeCapture(f.db as never).backfill();
    f.db.runSync("DELETE FROM media_assets WHERE id='a'");
    await f.migrate();
    expect(await f.service.assets()).toHaveLength(0);
    f.insert('a');
    await f.migrate();
    expect(await f.service.assets()).toHaveLength(0);
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
  } finally { f.db.close(); }
});

test('late download attaches to the preserved missing version, without creating a new asset', async () => {
  const f = fixture();
  try {
    f.insert('a'); await f.migrate();
    const asset = (await f.service.assets())[0];
    expect((await f.service.versions(asset.id))[0].state).toBe('MISSING');
    f.retain('a'); f.db.runSync("UPDATE media_assets SET updated_at=2 WHERE id='a'");
    await f.migrate();
    expect(await f.service.assets()).toHaveLength(1);
    expect((await f.service.versions(asset.id))[0].state).toBe('AVAILABLE');
    expect((await f.service.versions(asset.id))[0].blobSha256).toBe(f.hash);
  } finally { f.db.close(); }
});

test('migration mapping failure rolls back versions and pins and can resume', async () => {
  const f = fixture();
  try {
    f.insert('a'); f.retain('a');
    f.db.execSync("CREATE TRIGGER reject_mapping BEFORE INSERT ON creative_legacy_assets BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.migrate()).rejects.toThrow('injected');
    expect(await f.service.assets()).toHaveLength(0);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(0);
    f.db.execSync('DROP TRIGGER reject_mapping'); await f.migrate();
    expect(await f.service.assets()).toHaveLength(1);
  } finally { f.db.close(); }
});
test('legacy mutation during file copy cannot attach stale bytes before journal replay',async()=>{
  const f=fixture();try{
    f.insert('a');f.db.runSync("UPDATE media_assets SET local_path='file:///old.mp4' WHERE id='a'");
    const release=jest.fn(async()=>undefined);
    await migrateLegacyCreativeBatch(f.db as never,{importLocal:async()=>{
      f.db.runSync("UPDATE media_assets SET local_path='file:///new.mp4',prompt='new prompt',updated_at=2 WHERE id='a'");
      return {hash:f.hash,release};
    }},30);
    expect(await f.service.assets()).toHaveLength(0);expect(release).toHaveBeenCalledTimes(1);
    await migrateLegacyCreativeBatch(f.db as never,{importLocal:async uri=>{expect(uri).toBe('file:///new.mp4');return {hash:f.hash,release};}},30);
    const a=(await f.service.assets())[0];expect((await f.service.versions(a.id))[0].recipe.prompt).toBe('new prompt');
  }finally{f.db.close();}
});


test.each([false,true])('legacy deletion is atomic and preserves adopted creative assets (adopted=%s)',async(adopted)=>{
  const f=fixture();try{
    f.insert('a');f.retain('a');await f.migrate();
    const asset=(await f.service.assets())[0];
    if(adopted){
      const project=await f.service.execute({name:'project.create',payload:{title:'film'}},'project');
      if(project.status!=='completed')throw new Error('expected');
      await f.service.execute({name:'asset.linkToProject',payload:{assetId:asset.id,projectId:project.value.projectId,versionId:null}},'adopt');
    }
    const store=createSqliteMediaStore(f.db as never);
    f.db.execSync("CREATE TRIGGER reject_legacy_delete BEFORE UPDATE OF deleted ON creative_legacy_assets BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(store.remove('a')).rejects.toThrow('injected');
    expect(f.db.getAllSync('SELECT * FROM media_assets')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM media_asset_tombstones')).toHaveLength(0);
    expect(await f.service.assets()).toHaveLength(1);
    f.db.execSync('DROP TRIGGER reject_legacy_delete');
    await store.remove('a');
    expect(await f.service.assets()).toHaveLength(adopted?1:0);
    expect(f.db.getFirstSync('SELECT deleted FROM creative_legacy_assets')).toEqual({deleted:1});
    await f.migrate();
    expect(await f.service.assets()).toHaveLength(adopted?1:0);
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
  }finally{f.db.close();}
});
