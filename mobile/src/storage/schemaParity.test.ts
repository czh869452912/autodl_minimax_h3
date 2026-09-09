import { readFileSync } from 'fs';
import path from 'path';
import { createInitializedRealSqliteTestDb, createRealSqliteTestDb } from '../test/realSqlite';
import { ensureAppDatabase, resetAppDatabase } from './database';
import { APP_TABLES, APP_SCHEMA_VERSION } from './schema';
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
    expect(APP_SCHEMA_VERSION).toBe(terminalSchema.schemaVersion);
    expect(schema(fresh)).toEqual(terminalSchema.objects);
    expect(schema(historical)).toEqual(terminalSchema.objects);
    expect(schema(historical)).toEqual(schema(fresh));
    expect(historical.getFirstSync('SELECT prompt FROM tasks WHERE id=?', 'preserved')).toEqual({ prompt: 'original' });
    expect(fresh.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(row => row.name).sort()).toEqual([...APP_TABLES].sort());
    const expected = schema(fresh);
    resetAppDatabase(historical as never);
    expect(schema(historical)).toEqual(terminalSchema.objects);
    expect(schema(historical)).toEqual(expected);
    expect(historical.getAllSync('SELECT id FROM tasks')).toEqual([]);
  } finally { historical.close(); fresh.close(); }
});
