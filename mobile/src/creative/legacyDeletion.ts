/** Legacy deletion can retire its inbox entry, never an adopted creative asset. */
export const trashUnadoptedLegacyAssetSql = `INSERT OR IGNORE INTO creative_asset_trash(asset_id,reason,deleted_at)
  SELECT a.id,'legacy_deleted',? FROM creative_assets a WHERE a.id=? AND a.revision=0 AND a.current_version_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM creative_output_links l JOIN creative_asset_versions v ON v.id=l.version_id WHERE v.asset_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.asset_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM creative_shot_assets s JOIN creative_asset_versions v ON v.id=s.version_id WHERE v.asset_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM creative_draft_inputs i JOIN creative_asset_versions v ON v.id=i.version_id WHERE v.asset_id=a.id)`;
export function legacyDeletionStatements(sourceId:string,now:number){
  return [
    {sql:trashUnadoptedLegacyAssetSql.replace('a.id=?','a.id=(SELECT asset_id FROM creative_legacy_assets WHERE source_id=?)'),params:[now,sourceId]},
    {sql:'UPDATE creative_legacy_assets SET deleted=1 WHERE source_id=?',params:[sourceId]},
  ];
}
