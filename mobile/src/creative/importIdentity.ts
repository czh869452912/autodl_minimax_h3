import type { AppDatabase } from '../storage/appDatabase';

// Only collapse standalone imported originals, never generated candidates or edited histories.
export const importedOriginals = `SELECT a.id AS asset_id,a.kind,v.id AS version_id,f.blob_sha256
  FROM creative_assets a JOIN creative_asset_versions v ON v.asset_id=a.id AND v.source='import'
  JOIN creative_version_files f ON f.version_id=v.id AND f.role='original'
  WHERE NOT EXISTS(SELECT 1 FROM creative_asset_versions other WHERE other.asset_id=a.id AND other.id<>v.id)
  AND NOT EXISTS(SELECT 1 FROM creative_job_contexts c WHERE c.target_asset_id=a.id)`;

export async function importedAssetPeers(db: AppDatabase, id: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ asset_id: string }>(`WITH originals AS (${importedOriginals})
    SELECT peer.asset_id FROM originals selected JOIN originals peer
    ON peer.kind=selected.kind AND peer.blob_sha256=selected.blob_sha256 WHERE selected.asset_id=?`, id);
  return rows.length ? rows.map(row => row.asset_id) : [id];
}
