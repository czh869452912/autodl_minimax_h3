import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createJobRepository} from '../jobs/repository';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {archiveCreativeOutput} from './archiveOutput';
import {createTaskRepository} from '../tasks/repository';
import {migrateLegacyCreativeBatch} from './legacyMigration';
test.each([false,true])('old-entry generation archives within original commit, reuses historical version=%s',async(backfilled)=>{
  const db=createInitializedRealSqliteTestDb();try{
    await createJobRepository(db as never).upsert({id:'old-job',revision:0,workflowId:'h3',workflowVersion:'1',workflowContentHash:'hash',adapterId:'autodl',adapterVersion:'1',inputSnapshot:{prompt:'film',seed:42},status:'SUCCEEDED',createdAt:1,updatedAt:1});
    db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,artifact_id,job_id,kind) VALUES('old-media','old-job','film','film','','video/mp4','queued',1,1,'clip','old-job','video')");
    if(backfilled)await migrateLegacyCreativeBatch(db as never);
    const hash='c'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'video/mp4',`cas/${hash}`);
    const input={jobId:'old-job',artifact:{id:'clip',kind:'video'},blob:{sha256:hash},now:100} as Parameters<typeof archiveCreativeOutput>[1];
    db.execSync("CREATE TRIGGER fail_old_output BEFORE INSERT ON creative_output_links BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(withWriteTransaction(db as never,tx=>archiveCreativeOutput(tx,input))).rejects.toThrow('injected');
    expect(db.getAllSync('SELECT * FROM creative_version_files')).toHaveLength(0);
    db.execSync('DROP TRIGGER fail_old_output');
    await withWriteTransaction(db as never,tx=>archiveCreativeOutput(tx,input));
    await withWriteTransaction(db as never,tx=>archiveCreativeOutput(tx,input));
    await migrateLegacyCreativeBatch(db as never);
    expect(db.getAllSync('SELECT * FROM creative_assets')).toHaveLength(1);
    expect(db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
    expect(db.getFirstSync('SELECT current_version_id FROM creative_assets')).toEqual({current_version_id:null});
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
    await createTaskRepository(db as never).remove('old-job');
    expect(db.getFirstSync('SELECT task_id FROM task_removals')).toEqual({task_id:'old-job'});
    expect(db.getAllSync('SELECT * FROM creative_output_links')).toHaveLength(1);
    expect(db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{db.close();}
});
