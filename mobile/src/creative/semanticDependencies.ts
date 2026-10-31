import type {AppDatabase} from '../storage/appDatabase';

export async function readSemanticReferences(db:AppDatabase,versionId:string,projectId:string){
 return db.getAllAsync<{asset_version_id:string;purpose:string;title:string;version_no:number;kind:string;relative_path:string|null;unavailable_reason:string|null}>(`SELECT r.asset_version_id,r.purpose,a.title,v.version_no,a.kind,b.relative_path,
 CASE WHEN t.asset_id IS NOT NULL THEN 'TRASHED' WHEN p.asset_id IS NULL THEN 'OUTSIDE_PROJECT'
 WHEN f.state IS NULL OR f.state!='AVAILABLE' OR fr.state IS NULL OR fr.state!='AVAILABLE' THEN 'ORIGINAL_UNAVAILABLE' ELSE NULL END AS unavailable_reason
 FROM creative_semantic_references r JOIN creative_semantic_versions sv ON sv.id=r.semantic_version_id
 JOIN creative_semantic_entities e ON e.id=sv.entity_id AND e.project_id=?
 JOIN creative_asset_versions v ON v.id=r.asset_version_id JOIN creative_assets a ON a.id=v.asset_id
 LEFT JOIN creative_project_assets p ON p.asset_id=a.id AND p.project_id=e.project_id
 LEFT JOIN creative_asset_trash t ON t.asset_id=a.id LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original'
 LEFT JOIN creative_file_resources fr ON fr.version_id=v.id AND fr.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256
 WHERE r.semantic_version_id=? ORDER BY r.asset_version_id`,projectId,versionId);
}

/** Historical versions remain inspectable, but only current use prevents unlink/trash. */
export async function assertSemanticAssetRemovable(db:AppDatabase,assetId:string,projectId?:string){
 const use=await db.getFirstAsync<{title:string;version_no:number;shot_title:string|null}>(`SELECT e.title,v.version_no,
 (SELECT s.title FROM creative_shot_semantics b JOIN creative_shots s ON s.id=b.shot_id AND s.deleted_at IS NULL WHERE b.version_id=v.id LIMIT 1) AS shot_title
 FROM creative_semantic_references r JOIN creative_semantic_versions v ON v.id=r.semantic_version_id JOIN creative_semantic_entities e ON e.id=v.entity_id
 JOIN creative_asset_versions a ON a.id=r.asset_version_id WHERE a.asset_id=? AND (? IS NULL OR e.project_id=?) AND (
 e.current_version_id=v.id OR EXISTS(SELECT 1 FROM creative_shot_semantics b JOIN creative_shots s ON s.id=b.shot_id WHERE b.version_id=v.id AND s.deleted_at IS NULL)
 OR EXISTS(SELECT 1 FROM creative_draft_semantics ds JOIN creative_generation_drafts d ON d.id=ds.draft_id, json_each(ds.snapshot_json,'$.items') item
 WHERE d.state='EDITING' AND json_extract(item.value,'$.version_id')=v.id)) LIMIT 1`,assetId,projectId??null,projectId??null);
 if(use)throw new Error(`素材仍被设定「${use.title}」版本 ${use.version_no}${use.shot_title?' / 镜头「'+use.shot_title+'」':''}使用；请先替换设定引用、解除镜头绑定或处理编辑中草稿`);
}
