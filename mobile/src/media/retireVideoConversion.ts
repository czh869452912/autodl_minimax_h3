import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';

/** Upgrade repair: preserve original bytes and export history, retire conversion work. */
export async function retireVideoConversion(db: AppDatabase, options: {
  resolveUri(path: string): string;
  fileExists(uri: string): Promise<boolean>;
  now: number;
}) {
  await db.runAsync(`UPDATE workflow_operations SET state='FAILED',lease_owner=NULL,lease_expires_at=NULL,
    last_error_json=?,updated_at=? WHERE kind='ARTIFACT_DOWNLOAD' AND state<>'SUCCEEDED'
    AND json_valid(payload_json) AND json_extract(payload_json,'$.compatibilityOnly')=1
    AND (last_error_json IS NULL OR NOT json_valid(last_error_json) OR json_extract(last_error_json,'$.code') IS NOT 'ARTIFACT_CONVERSION_RETIRED')`,
  JSON.stringify({ code: 'ARTIFACT_CONVERSION_RETIRED', message: 'Original playback replaces conversion.', retryable: false }), options.now);
  const rows = await db.getAllAsync<{ id: string; task_id: string; relative_path: string; local_path: string | null; sha256: string }>(
    `SELECT m.id,m.task_id,m.local_path,b.relative_path,b.sha256 FROM media_assets m
     JOIN artifact_blob_refs r ON r.owner_type='workflow_artifact_original' AND r.owner_id=m.id
     JOIN artifact_blobs b ON b.sha256=r.blob_sha256
     WHERE m.kind='video' AND (m.local_path IS NULL OR m.local_path<>? || b.relative_path OR m.status<>'downloaded') ORDER BY m.id`, options.resolveUri(''));
  for (const row of rows) {
    const uri = options.resolveUri(row.relative_path);
    if (!await options.fileExists(uri)) continue;
    await withWriteTransaction(db, async tx => {
      // Recheck the reference in the transaction so concurrent removal cannot resurrect a task.
      const ref = await tx.getFirstAsync('SELECT 1 FROM artifact_blob_refs WHERE owner_type=? AND owner_id=? AND blob_sha256=?', 'workflow_artifact_original', row.id, row.sha256);
      if (!ref) return;
      await tx.runAsync("UPDATE media_assets SET local_path=?,status='downloaded',poster_path=NULL,updated_at=? WHERE id=?", uri, options.now, row.id);
      await tx.runAsync("UPDATE tasks SET local_uri=?,download_state='DOWNLOADED',download_error=NULL,download_progress=1,updated_at=MAX(updated_at,?) WHERE id=?", uri, options.now, row.task_id);
    });
  }
}
