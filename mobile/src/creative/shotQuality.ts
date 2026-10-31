import type {AppDatabase} from '../storage/appDatabase';

/** Structural quality checks only: no model calls, adoption, or claims about visual quality. */
export async function inspectShotQuality(db:AppDatabase,projectId:string,shotId:string){
 const shot=await db.getFirstAsync<{id:string;revision:number;description:string}>('SELECT id,revision,description FROM creative_shots WHERE id=? AND project_id=? AND deleted_at IS NULL',shotId,projectId);
 if(!shot)throw new Error('AGENT_SHOT_SCOPE_MISMATCH');
 const findings:Array<{code:string;severity:'warning'|'error';versionId?:string}>=[];
 if(!shot.description.trim())findings.push({code:'SHOT_DESCRIPTION_EMPTY',severity:'warning'});
 const bindings=await db.getAllAsync<{slot:string;version_id:string;state:string|null;trashed:number}>(`SELECT a.slot,a.version_id,f.state,
 EXISTS(SELECT 1 FROM creative_asset_versions v JOIN creative_asset_trash t ON t.asset_id=v.asset_id WHERE v.id=a.version_id) AS trashed
 FROM creative_shot_assets a LEFT JOIN creative_version_files f ON f.version_id=a.version_id AND f.role='original' WHERE a.shot_id=? ORDER BY a.slot,a.ordinal`,shotId);
 for(const slot of ['selected_image','selected_video'])if(!bindings.some(b=>b.slot===slot))findings.push({code:slot==='selected_image'?'IMAGE_NOT_ADOPTED':'VIDEO_NOT_ADOPTED',severity:'warning'});
 for(const binding of bindings)if(binding.state!=='AVAILABLE'||binding.trashed)findings.push({code:'ADOPTED_MEDIA_UNAVAILABLE',severity:'error',versionId:binding.version_id});
 const stale=await db.getAllAsync<{version_id:string}>(`SELECT b.version_id FROM creative_shot_semantics b JOIN creative_semantic_entities e ON e.id=b.entity_id
 WHERE b.shot_id=? AND e.current_version_id IS NOT NULL AND e.current_version_id!=b.version_id`,shotId);
 for(const row of stale)findings.push({code:'SEMANTIC_REVIEW_REQUIRED',severity:'warning',versionId:row.version_id});
 const failed=await db.getFirstAsync('SELECT s.id FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id WHERE p.shot_id=? AND p.state=\'ACTIVE\' AND s.state IN (\'FAILED\',\'BLOCKED\') LIMIT 1',shotId);
 if(failed)findings.push({code:'PLAN_NEEDS_ATTENTION',severity:'warning'});
 return {shotId,shotRevision:shot.revision,findings,status:findings.length?'needs_review':'structural_checks_passed',readOnly:true,
  notChecked:['visual_identity','motion_quality','audio_quality','subtitle_accuracy','original_byte_integrity'],adoptionAllowed:false};
}
