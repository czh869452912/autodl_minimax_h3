import type {AppDatabase} from '../storage/appDatabase';
export type UsageEdge={kind:string;object_id:string;version_id:string|null;title:string;project_id:string|null;project_title:string|null;version_no:number|null;provider_id:string|null;available:number;purpose:string|null};
/** Bounded read-only relation pages; deletion protection remains transactional and unbounded. */
export function readUsageGraph(db:AppDatabase,assetId:string,offset=0){
 return db.getAllAsync<UsageEdge>(`WITH edges AS (
 SELECT '项目' AS kind,project_id AS object_id,pinned_version_id AS version_id,NULL AS purpose FROM creative_project_assets WHERE asset_id=?
 UNION ALL SELECT '镜头',s.shot_id,s.version_id,s.slot FROM creative_shot_assets s JOIN creative_asset_versions v ON v.id=s.version_id WHERE v.asset_id=?
 UNION ALL SELECT '封面',c.project_id,c.version_id,NULL FROM creative_project_covers c JOIN creative_asset_versions v ON v.id=c.version_id WHERE v.asset_id=?
 UNION ALL SELECT '草稿输入',i.draft_id,i.version_id,i.slot FROM creative_draft_inputs i JOIN creative_asset_versions v ON v.id=i.version_id JOIN creative_generation_drafts d ON d.id=i.draft_id WHERE v.asset_id=? AND d.state!='DISCARDED'
 UNION ALL SELECT '任务冻结输入',i.job_id,i.version_id,i.slot FROM creative_job_inputs i JOIN creative_asset_versions v ON v.id=i.version_id WHERE v.asset_id=?
 ) SELECT e.*,v.version_no,
 COALESCE(p.title,h.title,dh.title,CASE WHEN d.id IS NOT NULL THEN COALESCE(NULLIF(json_extract(d.input_json,'$.prompt'),''),NULLIF(json_extract(d.input_json,'$.values.prompt'),''),'创作草稿') END,j.workflow_id,'来源已不可用') AS title,
 COALESCE(p.id,h.project_id,d.project_id,c.project_id) AS project_id,COALESCE(p.title,hp.title,dp.title,jp.title) AS project_title,d.provider_id,
 CASE WHEN e.kind IN ('项目','封面') THEN p.id IS NOT NULL WHEN e.kind='镜头' THEN h.id IS NOT NULL AND h.deleted_at IS NULL WHEN e.kind='草稿输入' THEN d.id IS NOT NULL AND d.state!='DISCARDED' ELSE j.id IS NOT NULL END AS available
 FROM edges e LEFT JOIN creative_asset_versions v ON v.id=e.version_id
 LEFT JOIN creative_projects p ON e.kind IN ('项目','封面') AND p.id=e.object_id
 LEFT JOIN creative_shots h ON e.kind='镜头' AND h.id=e.object_id LEFT JOIN creative_projects hp ON hp.id=h.project_id
 LEFT JOIN creative_generation_drafts d ON e.kind='草稿输入' AND d.id=e.object_id LEFT JOIN creative_shots dh ON dh.id=d.shot_id LEFT JOIN creative_projects dp ON dp.id=d.project_id
 LEFT JOIN workflow_jobs j ON e.kind='任务冻结输入' AND j.id=e.object_id LEFT JOIN creative_job_contexts c ON c.job_id=j.id LEFT JOIN creative_projects jp ON jp.id=c.project_id
 ORDER BY e.kind,e.object_id,e.version_id,e.purpose LIMIT 101 OFFSET ?`,assetId,assetId,assetId,assetId,assetId,Math.max(0,Math.floor(offset)));
}
