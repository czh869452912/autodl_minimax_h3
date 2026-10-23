import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createCreativeCapture } from '../storage/creativeCapture';
import { createId } from '../ids';

type Head = { entity_id: string; epoch: number; applied_revision: number; tombstoned: number; snapshot_json: string };
type Stage = { hash: string; release(): Promise<void> };
type Dependencies = { importLocal?(uri: string, mime: string): Promise<Stage>; now?: () => number };

/** Bounded and resumable: legacy writes remain captured until all writers are bridged. */
export async function migrateLegacyCreativeBatch(db: AppDatabase, deps: Dependencies = {}, limit = 30) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_BATCH_SIZE');
  const capture = createCreativeCapture(db), state = await capture.state();
  if (!state || state.phase === 'PRIMARY') return { imported: 0, pending: false };
  if (state.phase !== 'CATCHUP') await capture.backfill(limit);
  if ((await capture.state())?.phase === 'CATCHUP') await capture.replay(limit);
  const rows = await db.getAllAsync<Head>(`SELECT h.* FROM creative_projection_heads h LEFT JOIN creative_legacy_assets m ON m.source_id=h.entity_id
    WHERE h.projection_kind='legacy_media' AND (m.source_id IS NULL OR m.epoch!=h.epoch OR m.applied_revision<h.applied_revision) ORDER BY h.entity_id LIMIT ?`, limit);
  let imported = 0;
  for (const head of rows) {
    const snapshot = JSON.parse(head.snapshot_json);
    let staged: Stage | undefined;
    const existing = await db.getFirstAsync<{ sha256: string }>(`SELECT b.sha256 FROM artifact_blob_refs r JOIN artifact_blobs b ON b.sha256=r.blob_sha256
      WHERE r.owner_id=? AND r.owner_type IN ('workflow_artifact_original','workflow_artifact') ORDER BY CASE WHEN r.owner_type='workflow_artifact_original' THEN 0 ELSE 1 END LIMIT 1`, `${snapshot.task_id}:${snapshot.artifact_id}`);
    if (!existing && !head.tombstoned && typeof snapshot.local_path === 'string' && snapshot.local_path.startsWith('file://') && deps.importLocal) {
      try { staged = await deps.importLocal(snapshot.local_path, snapshot.mime_type); } catch { /* Preserve the missing record, never replace it with a new generation. */ }
    }
    try {
      await withWriteTransaction(db, async tx => {
        const current = await tx.getFirstAsync<Head>("SELECT * FROM creative_projection_heads WHERE projection_kind='legacy_media' AND entity_id=?", head.entity_id);
        if (!current || current.epoch !== head.epoch || current.applied_revision !== head.applied_revision) return;
        // File copying occurs outside this transaction. A concurrent legacy writer
        // may have changed the source before its journal event reaches the head.
        if(await tx.getFirstAsync('SELECT sequence FROM creative_legacy_changes WHERE source_id=? AND sequence>? LIMIT 1',head.entity_id,head.applied_revision))return;
        const map = await tx.getFirstAsync<{ asset_id: string; version_id: string; epoch: number; applied_revision: number; deleted: number }>('SELECT * FROM creative_legacy_assets WHERE source_id=?', head.entity_id);
        if (map && map.epoch === head.epoch && map.applied_revision >= head.applied_revision) return;
        const live = await tx.getFirstAsync<{ id: string }>('SELECT id FROM media_assets WHERE id=?', head.entity_id);
        const deleted = Boolean(head.tombstoned || !live || await tx.getFirstAsync('SELECT id FROM media_asset_tombstones WHERE id=?', head.entity_id));
        // New H3 outputs already have authoritative versions; map instead of duplicating.
        const output = await tx.getFirstAsync<{ version_id: string; asset_id: string }>('SELECT l.version_id,v.asset_id FROM creative_output_links l JOIN creative_asset_versions v ON v.id=l.version_id WHERE l.job_id=? AND l.artifact_id=?', snapshot.task_id, snapshot.artifact_id ?? '');
        const assetId = map?.asset_id ?? output?.asset_id ?? createId(), versionId = map?.version_id ?? output?.version_id ?? createId();
        const now = (deps.now ?? Date.now)();
        if (!map && !output) {
          const kind = ['image','video','audio'].includes(snapshot.kind) ? snapshot.kind : 'document';
          await tx.runAsync('INSERT INTO creative_assets VALUES(?,?,?,NULL,0,?,?)', assetId, kind, String(snapshot.title || '历史作品').slice(0,200), Number(snapshot.created_at) || now, now);
          await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,1,'generated',?,?)", versionId, assetId, JSON.stringify({ schemaVersion: 1, legacyMediaId: head.entity_id, jobId: snapshot.job_id ?? snapshot.task_id, workflowId: snapshot.workflow_id, prompt: snapshot.prompt ?? '', sourceUrl: snapshot.source_url ?? '' }), now);
        }
        const hash = existing?.sha256 ?? staged?.hash;
        if (hash && !deleted && !await tx.getFirstAsync("SELECT version_id FROM creative_version_files WHERE version_id=? AND role='original'", versionId)) {
          await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')", versionId, hash);
          await tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'creative_version',?,?)", hash, versionId, now);
        }
        if (!hash && !map && !output) {
          await tx.runAsync("INSERT INTO creative_file_resources(id,version_id,role,state,error_code,created_at,updated_at) VALUES(?,?,'original','MISSING','LEGACY_ORIGINAL_UNAVAILABLE',?,?)", `${versionId}:original`, versionId, now, now);
        }
        // A legacy deletion must never resurrect in the inbox. Already adopted
        // creative outputs retain their independent project/shot lifecycle.
        if (deleted && !output) await tx.runAsync("INSERT OR IGNORE INTO creative_asset_trash VALUES(?,'legacy_deleted',?)", assetId, now);
        await tx.runAsync('INSERT INTO creative_legacy_assets VALUES(?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET epoch=excluded.epoch,applied_revision=excluded.applied_revision,deleted=excluded.deleted', head.entity_id, assetId, versionId, head.epoch, head.applied_revision, deleted ? 1 : 0);
        imported++;
      });
    } finally { await staged?.release(); }
  }
  const latest = await capture.state();
  const pending = latest?.phase !== 'CATCHUP' || Boolean(await db.getFirstAsync('SELECT sequence FROM creative_legacy_changes WHERE sequence>? LIMIT 1', latest?.replay_sequence ?? 0)) || Boolean(await db.getFirstAsync("SELECT h.entity_id FROM creative_projection_heads h LEFT JOIN creative_legacy_assets m ON m.source_id=h.entity_id WHERE h.projection_kind='legacy_media' AND (m.source_id IS NULL OR m.epoch!=h.epoch OR m.applied_revision<h.applied_revision) LIMIT 1"));
  return { imported, pending };
}
