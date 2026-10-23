import type { AppDatabase } from '../storage/appDatabase';
import type { ArtifactCommitInput } from '../workflows/executor/artifactOperation';
import { createId } from '../ids';

/** Part of the download commit transaction: never adopt the output automatically. */
export async function archiveCreativeOutput(tx: AppDatabase, input: ArtifactCommitInput) {
  const context = await tx.getFirstAsync<{ target_asset_id: string; input_snapshot_json: string; execution_epoch: string }>('SELECT * FROM creative_job_contexts WHERE job_id=?', input.jobId);
  if (!context) return;
  if (!['video','image'].includes(input.artifact.kind)) return;
  const old = await tx.getFirstAsync<{ blob_sha256: string }>("SELECT f.blob_sha256 FROM creative_output_links l JOIN creative_version_files f ON f.version_id=l.version_id AND f.role='original' WHERE l.job_id=? AND l.artifact_id=?", input.jobId, input.artifact.id);
  if (old) { if (old.blob_sha256 !== input.blob.sha256) throw new Error('CREATIVE_OUTPUT_CONTENT_CHANGED'); return; }
  const versionId = createId();
  const next = await tx.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM creative_asset_versions WHERE asset_id=?', context.target_asset_id);
  const snapshot = JSON.parse(context.input_snapshot_json);
  const recipe = { schemaVersion: 1, provider: input.artifact.kind === 'image' ? 'novelai' : 'autodl', jobId: input.jobId, artifactId: input.artifact.id, input: { ...snapshot, ...(typeof input.artifact.metadata?.seed === 'number' ? { seed: input.artifact.metadata.seed } : {}) } };
  await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,?,'generated',?,?)", versionId, context.target_asset_id, next!.n, JSON.stringify(recipe), input.now);
  await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')", versionId, input.blob.sha256);
  await tx.runAsync("INSERT INTO artifact_blob_refs VALUES(?,'creative_version',?,?)", input.blob.sha256, versionId, input.now);
  await tx.runAsync('INSERT INTO creative_output_links VALUES(?,?,?)', input.jobId, input.artifact.id, versionId);
  await tx.runAsync('UPDATE creative_assets SET updated_at=? WHERE id=?', input.now, context.target_asset_id);
}
