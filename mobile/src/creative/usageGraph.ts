import type {AppDatabase} from '../storage/appDatabase';
export type UsageEdge={kind:string;object_id:string;version_id:string|null};
/** Read-only, bounded display; lifecycle protection remains transactional. */
export function readUsageGraph(db:AppDatabase,assetId:string){
 return db.getAllAsync<UsageEdge>(`SELECT '项目' AS kind,project_id AS object_id,pinned_version_id AS version_id FROM creative_project_assets WHERE asset_id=?
 UNION ALL SELECT '镜头',s.shot_id,s.version_id FROM creative_shot_assets s JOIN creative_asset_versions v ON v.id=s.version_id JOIN creative_shots h ON h.id=s.shot_id WHERE v.asset_id=? AND h.deleted_at IS NULL
 UNION ALL SELECT '封面',c.project_id,c.version_id FROM creative_project_covers c JOIN creative_asset_versions v ON v.id=c.version_id WHERE v.asset_id=?
 UNION ALL SELECT '草稿输入',i.draft_id,i.version_id FROM creative_draft_inputs i JOIN creative_asset_versions v ON v.id=i.version_id JOIN creative_generation_drafts d ON d.id=i.draft_id WHERE v.asset_id=? AND d.state!='DISCARDED'
 UNION ALL SELECT '任务冻结输入',i.job_id,i.version_id FROM creative_job_inputs i JOIN creative_asset_versions v ON v.id=i.version_id WHERE v.asset_id=?
 LIMIT 101`,assetId,assetId,assetId,assetId,assetId);
}
