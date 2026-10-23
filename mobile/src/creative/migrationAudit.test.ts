import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {migrateLegacyCreativeBatch} from './legacyMigration';
import {auditCreativeMigration} from './migrationAudit';
test('caught-up rows do not imply writer readiness; lost pins and delayed changes are visible',async()=>{
  const db=createInitializedRealSqliteTestDb();try{
    db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,artifact_id,kind) VALUES('a','job','film','','','video/mp4','downloaded',1,1,'clip','video')");
    db.runSync("INSERT INTO artifact_blobs VALUES(?,10,'video/mp4','cas/file',1,1)",'a'.repeat(64));
    db.runSync("INSERT INTO artifact_blob_refs VALUES(?,'workflow_artifact','job:clip',1)",'a'.repeat(64));
    expect(await auditCreativeMigration(db as never)).toMatchObject({unmapped:1,pendingJournal:1,caughtUp:false,canCutover:false});
    await migrateLegacyCreativeBatch(db as never);
    expect(await auditCreativeMigration(db as never)).toMatchObject({unmapped:0,pendingJournal:0,caughtUp:true,writersReady:false,canCutover:false,missingPins:0});
    db.runSync("DELETE FROM artifact_blob_refs WHERE owner_type='creative_version'");
    expect(await auditCreativeMigration(db as never)).toMatchObject({missingPins:1,canCutover:false});
    db.runSync("UPDATE media_assets SET updated_at=2");
    expect(await auditCreativeMigration(db as never)).toMatchObject({pendingJournal:1,caughtUp:false});
  }finally{db.close();}
});
