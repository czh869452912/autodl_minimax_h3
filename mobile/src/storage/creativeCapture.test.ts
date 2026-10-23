import fs from 'fs';
import os from 'os';
import path from 'path';
import { createInitializedRealSqliteTestDb, createRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeCapture, applyCreativeProjection } from './creativeCapture';
import { ensureAppDatabase } from './database';

function insert(db: ReturnType<typeof createInitializedRealSqliteTestDb>, id: string) {
  db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at) VALUES(?, 't', ?, '', '', 'image/png','downloaded',1,1)", id, id);
}

test('capture, resumable backfill and ordered deletion replay survive reopening the database', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creative-capture-'));
  const file = path.join(dir, 'db');
  let db = createInitializedRealSqliteTestDb(file);
  try {
    insert(db, 'a'); insert(db, 'b');
    await createCreativeCapture(db as never).backfill(1);
    db.runSync("UPDATE media_assets SET title='new' WHERE id='a'");
    db.runSync("DELETE FROM media_assets WHERE id='b'");
    insert(db, '0-late');
    db.close(); db = createInitializedRealSqliteTestDb(file);
    const service = createCreativeCapture(db as never);
    await service.backfill(1);
    while (await service.replay(1)) { /* replay from durable watermark */ }
    const rows = db.getAllSync<{ entity_id: string; snapshot_json: string; tombstoned: number }>('SELECT * FROM creative_projection_heads ORDER BY entity_id');
    expect(rows.map(r => [r.entity_id, r.tombstoned])).toEqual([['0-late', 0], ['a', 0], ['b', 1]]);
    expect(JSON.parse(rows[1].snapshot_json).title).toBe('new');
    expect(() => db.execSync("UPDATE creative_migration_state SET phase='PRIMARY' WHERE id=1")).toThrow('CREATIVE_WRITERS_NOT_READY');
  } finally { db.close(); fs.rmSync(dir, { recursive: true }); }
});

test('late snapshots cannot undo a tombstone and old epochs are rejected', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const apply = (revision: number, deleted: boolean, epoch = 1) => applyCreativeProjection(db as never, { kind: 'test', id: 'a', revision, deleted, epoch, snapshot: '{}' });
    await apply(12, true); await apply(11, false); await apply(12, false);
    expect(db.getFirstSync('SELECT applied_revision,tombstoned FROM creative_projection_heads')).toEqual({ applied_revision: 12, tombstoned: 1 });
    await expect(apply(13, false, 0)).rejects.toThrow('CREATIVE_EPOCH_STALE');
    await apply(13, false);
    expect(db.getFirstSync('SELECT tombstoned FROM creative_projection_heads')).toEqual({ tombstoned: 0 });
  } finally { db.close(); }
});

test('failed replay rolls back both watermark and projected snapshot', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    insert(db, 'a');
    const service = createCreativeCapture(db as never);
    await service.backfill();
    db.execSync("CREATE TRIGGER test_fail BEFORE UPDATE OF replay_sequence ON creative_migration_state BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(service.replay()).rejects.toThrow('injected');
    expect((await service.state())?.replay_sequence).toBe(0);
    expect(db.getFirstSync('SELECT applied_revision FROM creative_projection_heads')).toEqual({ applied_revision: 0 });
    db.execSync('DROP TRIGGER test_fail');
    expect(await service.replay()).toBe(1);
  } finally { db.close(); }
});

test('v13 upgrade preserves legacy media and starts capture atomically', () => {
  const db = createRealSqliteTestDb();
  try {
    const { CURRENT_SCHEMA_STATEMENTS } = require('./schema');
    for (const sql of CURRENT_SCHEMA_STATEMENTS as string[]) if (!sql.includes('creative_')) db.execSync(sql);
    // Existing v13 already contains the columns added by v6.
    require('./migrations/v6DurableExecutor').v6DurableExecutor.apply({ db, exec: (sql: string) => db.execSync(sql), hasColumn: (table: string, column: string) => db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).some(r => r.name === column) });
    db.execSync('PRAGMA user_version=13'); insert(db, 'old');
    ensureAppDatabase(db as never);
    expect(db.getFirstSync('SELECT id FROM media_assets')).toEqual({ id: 'old' });
    expect(db.getAllSync('SELECT * FROM creative_legacy_changes')).toEqual([]);
    db.runSync("UPDATE media_assets SET title='edited' WHERE id='old'");
    expect(db.getAllSync('SELECT * FROM creative_legacy_changes')).toHaveLength(1);
  } finally { db.close(); }
});
