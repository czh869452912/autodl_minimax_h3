import { readFileSync } from 'fs';
import path from 'path';
import { createInitializedRealSqliteTestDb, createRealSqliteTestDb } from '../test/realSqlite';
import { ensureAppDatabase, resetAppDatabase } from './database';
import { APP_TABLES, APP_SCHEMA_VERSION, V11_SCHEMA_STATEMENTS } from './schema';
import terminalSchema from './migrations/fixtures/v9-terminal-schema.json';

function schema(db: ReturnType<typeof createRealSqliteTestDb>) {
  return db.getAllSync<{ type: string; name: string; sql: string }>(
    "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
  ).map(row => ({ ...row, sql: row.sql.replace(/\s+/g, '').replaceAll('"', '') }));
}

test.each([5, 6, 7, 8])('frozen v%s upgrades to fresh schema including constraints and projection triggers', version => {
  const fresh = createInitializedRealSqliteTestDb();
  const historical = createRealSqliteTestDb();
  try {
    historical.execSync(readFileSync(path.join(__dirname, 'migrations/fixtures', `v${version}-schema.sql`), 'utf8'));
    historical.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('preserved','original','RUNNING','768p',5,1,2)");
    ensureAppDatabase(historical as never);
    expect(fresh.getFirstSync('PRAGMA user_version')).toEqual({ user_version: APP_SCHEMA_VERSION });
    const v10Names = new Set(['task_monitor_events', 'task_monitor_event_insert', 'task_monitor_event_delete', 'media_asset_tombstones', 'idx_media_tombstones_task', 'media_assets_respect_deletion', 'media_refs_respect_deletion', 'media_deliveries_respect_deletion']);
    expect(schema(fresh).filter(row => !v10Names.has(row.name))).toEqual(terminalSchema.objects);
    expect(schema(historical).filter(row => !v10Names.has(row.name))).toEqual(terminalSchema.objects);
    expect(schema(historical)).toEqual(schema(fresh));
    expect(historical.getFirstSync('SELECT prompt FROM tasks WHERE id=?', 'preserved')).toEqual({ prompt: 'original' });
    expect(fresh.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(row => row.name).sort()).toEqual([...APP_TABLES].sort());
    const expected = schema(fresh);
    resetAppDatabase(historical as never);
    expect(schema(historical).filter(row => !v10Names.has(row.name))).toEqual(terminalSchema.objects);
    expect(schema(historical)).toEqual(expected);
    expect(historical.getAllSync('SELECT id FROM tasks')).toEqual([]);
  } finally { historical.close(); fresh.close(); }
});


test('frozen v9 migrates deletion guards without losing historical tables', () => {
  const db = createRealSqliteTestDb();
  try {
    // The frozen terminal SQL is normalized for comparison, so use the v8 fixture
    // followed by the historical v9 migration to build its real SQLite syntax.
    db.execSync(readFileSync(path.join(__dirname, 'migrations/fixtures/v8-schema.sql'), 'utf8'));
    const { v9AgentRecords } = require('./migrations/v9AgentRecords');
    v9AgentRecords.apply({ db, exec: (sql: string) => db.execSync(sql), hasColumn: () => false });
    db.execSync('PRAGMA user_version=9');
    ensureAppDatabase(db as never);
    expect(db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: APP_SCHEMA_VERSION });
    expect(db.getAllSync("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%respect_deletion'")).toHaveLength(3);
  } finally { db.close(); }
});

test('v10 upgrade preserves tasks and only streams events committed after migration', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync(readFileSync(path.join(__dirname, 'migrations/fixtures/v8-schema.sql'), 'utf8'));
    const context = { db, exec: (sql: string) => db.execSync(sql), hasColumn: () => false };
    require('./migrations/v9AgentRecords').v9AgentRecords.apply(context);
    require('./migrations/v10MediaDeletion').v10MediaDeletion.apply(context);
    db.execSync('PRAGMA user_version=10');
    db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('A','preserved','RUNNING','768p',5,1,2)");
    db.runSync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES('old','A',0,'STATUS_RECONCILED','{}',1)");
    ensureAppDatabase(db as never);
    expect(db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: APP_SCHEMA_VERSION });
    expect(db.getFirstSync('SELECT prompt FROM tasks WHERE id=?', 'A')).toEqual({ prompt: 'preserved' });
    expect(db.getAllSync('SELECT * FROM task_monitor_events')).toEqual([]);
    db.runSync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES('new','A',1,'STATUS_RECONCILED','{}',2)");
    expect(db.getFirstSync('SELECT event_id FROM task_monitor_events')).toEqual({ event_id: 'new' });
  } finally { db.close(); }
});

test('already-installed v11 upgrades the trigger without resetting its cursor or replaying old failures', () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    db.execSync('DROP TRIGGER task_monitor_event_insert');
    db.execSync(V11_SCHEMA_STATEMENTS[1]);
    db.execSync('PRAGMA user_version=11');
    const insert = (id: string, kind: string) => db.runSync('INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES(?,?,0,?,?,1)', id, id, kind, '{}');
    insert('existing', 'STATUS_RECONCILED');
    insert('missed-before-upgrade', 'SUBMIT_FAILED');
    const cursor = db.getFirstSync<{ seq: number }>("SELECT seq FROM sqlite_sequence WHERE name='task_monitor_events'")!.seq;
    ensureAppDatabase(db as never);
    expect(db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: APP_SCHEMA_VERSION });
    expect(db.getAllSync('SELECT event_id FROM task_monitor_events')).toEqual([{ event_id: 'existing' }]);
    insert('submit', 'SUBMIT_FAILED'); insert('poll', 'STATUS_SYNC_FAILED'); insert('uncertain', 'SUBMIT_UNKNOWN');
    expect(db.getAllSync('SELECT event_id FROM task_monitor_events WHERE sequence>? ORDER BY sequence', cursor)).toEqual([{ event_id: 'submit' }, { event_id: 'poll' }]);
  } finally { db.close(); }
});
