import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
/** A single consistent DB snapshot; counts do not claim filesystem verification. */
export async function auditCreativeMigration(db:AppDatabase){
  return withWriteTransaction(db,async tx=>{
    const state=await tx.getFirstAsync<{phase:string;epoch:number;replay_sequence:number;writer_ready:number}>('SELECT * FROM creative_migration_state WHERE id=1');
    if(!state)throw new Error('CREATIVE_MIGRATION_STATE_MISSING');
    const count=async(sql:string,...args:(string|number)[])=>Number((await tx.getFirstAsync<{n:number}>(sql,...args))?.n??0);
    const pendingJournal=await count('SELECT COUNT(*) AS n FROM creative_legacy_changes WHERE sequence>?',state.replay_sequence);
    const unmapped=await count('SELECT COUNT(*) AS n FROM media_assets a LEFT JOIN creative_legacy_assets m ON m.source_id=a.id WHERE m.source_id IS NULL');
    const staleMappings=await count(`SELECT COUNT(*) AS n FROM creative_projection_heads h LEFT JOIN creative_legacy_assets m ON m.source_id=h.entity_id WHERE h.projection_kind='legacy_media' AND (m.source_id IS NULL OR m.epoch!=h.epoch OR m.applied_revision<h.applied_revision)`);
    const missingPins=await count(`SELECT COUNT(*) AS n FROM creative_version_files f WHERE NOT EXISTS(SELECT 1 FROM artifact_blob_refs r WHERE r.blob_sha256=f.blob_sha256 AND r.owner_type='creative_version' AND r.owner_id=f.version_id)`);
    const brokenMappings=await count(`SELECT COUNT(*) AS n FROM creative_legacy_assets m LEFT JOIN creative_asset_versions v ON v.id=m.version_id WHERE v.id IS NULL OR v.asset_id!=m.asset_id`);
    const unavailableFiles=await count("SELECT COUNT(*) AS n FROM creative_file_resources WHERE state!='AVAILABLE'");
    const foreignKeyViolations=(await tx.getAllAsync('PRAGMA foreign_key_check')).length;
    const caughtUp=state.phase==='CATCHUP'&&!pendingJournal&&!unmapped&&!staleMappings&&!brokenMappings;
    return {phase:state.phase,epoch:state.epoch,pendingJournal,unmapped,staleMappings,missingPins,brokenMappings,unavailableFiles,foreignKeyViolations,caughtUp,
      writersReady:state.writer_ready===1,canCutover:caughtUp&&state.writer_ready===1&&!missingPins&&!foreignKeyViolations};
  });
}
