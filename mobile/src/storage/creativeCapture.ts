import type { AppDatabase } from './appDatabase';
import { withWriteTransaction } from './sqliteBusy';

type State = { phase: 'CAPTURE' | 'BACKFILL' | 'CATCHUP' | 'PRIMARY'; epoch: number; backfill_cursor: string | null; replay_sequence: number };
type Snapshot = { id: string; [key: string]: unknown };
type Change = { sequence: number; source_id: string; kind: 'UPSERT' | 'DELETE'; snapshot_json: string };

/** Full snapshots only: stale updates and stale tombstones cannot move a projection backwards. */
export async function applyCreativeProjection(tx: AppDatabase, input: { kind: string; id: string; epoch: number; revision: number; deleted: boolean; snapshot: string }) {
  const state = await tx.getFirstAsync<State>('SELECT * FROM creative_migration_state WHERE id=1');
  if (!state || state.epoch !== input.epoch) throw new Error('CREATIVE_EPOCH_STALE');
  await tx.runAsync(`INSERT INTO creative_projection_heads(projection_kind,entity_id,epoch,applied_revision,tombstoned,snapshot_json) VALUES(?,?,?,?,?,?)
    ON CONFLICT(projection_kind,entity_id) DO UPDATE SET epoch=excluded.epoch,applied_revision=excluded.applied_revision,tombstoned=excluded.tombstoned,snapshot_json=excluded.snapshot_json
    WHERE creative_projection_heads.epoch=excluded.epoch AND creative_projection_heads.applied_revision<excluded.applied_revision`, input.kind, input.id, input.epoch, input.revision, input.deleted ? 1 : 0, input.snapshot);
}

export function createCreativeCapture(db: AppDatabase) {
  return {
    async state() { return db.getFirstAsync<State>('SELECT * FROM creative_migration_state WHERE id=1'); },
    async backfill(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('INVALID_BATCH_SIZE');
      let count = 0;
      await withWriteTransaction(db, async tx => {
        const state = await tx.getFirstAsync<State>('SELECT * FROM creative_migration_state WHERE id=1');
        if (!state || state.phase === 'PRIMARY') throw new Error('CREATIVE_CAPTURE_CLOSED');
        if (state.phase === 'CATCHUP') return;
        const rows = await tx.getAllAsync<Snapshot>('SELECT * FROM media_assets WHERE (? IS NULL OR id>?) ORDER BY id LIMIT ?', state.backfill_cursor, state.backfill_cursor, limit);
        for (const row of rows) await applyCreativeProjection(tx, { kind: 'legacy_media', id: row.id, epoch: state.epoch, revision: 0, deleted: false, snapshot: JSON.stringify(row) });
        count = rows.length;
        await tx.runAsync('UPDATE creative_migration_state SET phase=?,backfill_cursor=? WHERE id=1', rows.length < limit ? 'CATCHUP' : 'BACKFILL', rows.at(-1)?.id ?? state.backfill_cursor);
      });
      return count;
    },
    async replay(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('INVALID_BATCH_SIZE');
      let count = 0;
      await withWriteTransaction(db, async tx => {
        const state = await tx.getFirstAsync<State>('SELECT * FROM creative_migration_state WHERE id=1');
        if (!state || state.phase !== 'CATCHUP') throw new Error('CREATIVE_BACKFILL_INCOMPLETE');
        const rows = await tx.getAllAsync<Change>('SELECT * FROM creative_legacy_changes WHERE sequence>? ORDER BY sequence LIMIT ?', state.replay_sequence, limit);
        for (const row of rows) await applyCreativeProjection(tx, { kind: 'legacy_media', id: row.source_id, epoch: state.epoch, revision: row.sequence, deleted: row.kind === 'DELETE', snapshot: row.snapshot_json });
        if (rows.length) await tx.runAsync('UPDATE creative_migration_state SET replay_sequence=? WHERE id=1', rows.at(-1)!.sequence);
        count = rows.length;
      });
      return count;
    },
  };
}
