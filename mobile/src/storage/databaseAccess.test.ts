import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInitializedRealSqliteTestDb, createRealSqliteTestDb } from '../test/realSqlite';
import { protectDatabase } from './databaseAccess';
import { ensureAppDatabase, resetAppDatabase, assertAppDatabaseWritableAsync } from './database';
import { markRecovery } from './recovery';
import { APP_SCHEMA_VERSION } from './schema';
import type { AppDatabase } from './appDatabase';

// Compiled by typecheck, deliberately not executed: native APIs must not typecheck.
function nativeCapabilityTypeChecks(db: AppDatabase) {
  // @ts-expect-error application handles cannot close native connections
  db.closeSync();
  // @ts-expect-error application handles cannot create native sessions
  db.createSessionAsync();
  // @ts-expect-error application handles cannot serialize native databases
  db.serializeAsync();
}
void nativeCapabilityTypeChecks;

test('untyped callers receive an explicit denial for unsupported native APIs', () => {
  const raw = createInitializedRealSqliteTestDb();
  const db = protectDatabase(raw as never, { startupDiagnostic: () => undefined });
  try {
    for (const name of ['closeSync', 'serializeAsync', 'createSessionAsync']) {
      expect(() => Reflect.get(db, name)).toThrow(`APP_DATABASE_READ_ONLY: UNSUPPORTED_DATABASE_API:${name}`);
    }
    expect(Object.isFrozen(db)).toBe(true);
  } finally { raw.close(); }
});

test('guard preserves busy failures for the caller retry policy and never executes the write', () => {
  const busy = new Error('SQLITE_BUSY: database is locked');
  const raw = { getFirstSync: jest.fn(() => { throw busy; }), runSync: jest.fn() };
  const db = protectDatabase(raw as never, { startupDiagnostic: () => undefined });
  expect(() => db.runSync('DELETE FROM tasks')).toThrow(busy);
  expect(raw.runSync).not.toHaveBeenCalled();
});

test('future and recovery handles reject every SQL entry including query methods', async () => {
  const raw = createInitializedRealSqliteTestDb();
  const db = protectDatabase(raw as never, { startupDiagnostic: () => undefined });
  try {
    await db.runAsync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('a','p','QUEUED','768p',5,1,1)");
    raw.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION + 1}`);
    expect(() => db.runSync('DELETE FROM tasks')).toThrow('READ_ONLY');
    expect(() => db.getFirstSync('DELETE FROM tasks RETURNING id')).toThrow('READ_ONLY');
    await expect(db.getAllAsync('DELETE FROM tasks RETURNING id')).rejects.toThrow('READ_ONLY');
    await expect(db.execAsync('PRAGMA query_only=OFF; DELETE FROM tasks')).rejects.toThrow('READ_ONLY');
    await expect(db.prepareAsync('DELETE FROM tasks')).rejects.toThrow('READ_ONLY');
    await expect(assertAppDatabaseWritableAsync(db)).rejects.toThrow('READ_ONLY');
    expect(() => resetAppDatabase(db)).toThrow('READ_ONLY');
    expect(db.getFirstSync('PRAGMA user_version')).toEqual({ user_version: APP_SCHEMA_VERSION + 1 });
    expect((db as unknown as { nativeDatabase?: unknown }).nativeDatabase).toBeUndefined();
    expect(raw.getAllSync('SELECT id FROM tasks')).toHaveLength(1);
  } finally { raw.close(); }
});

test('recovery latch survives marker failure and reset restores access', async () => {
  const raw = createInitializedRealSqliteTestDb();
  const reset = jest.fn();
  const db = protectDatabase(raw as never, { startupDiagnostic: () => undefined, didReset: reset });
  try {
    raw.execSync("CREATE TRIGGER reject_marker BEFORE INSERT ON app_database_recovery BEGIN SELECT RAISE(ABORT,'failed marker'); END");
    markRecovery(db, 'FAILED', 1);
    await expect(db.runAsync('DELETE FROM tasks')).rejects.toThrow('FAILED');
    resetAppDatabase(db);
    await expect(db.runAsync('DELETE FROM tasks')).resolves.toBeDefined();
    expect(reset).toHaveBeenCalledTimes(1);
  } finally { raw.close(); }
});

test('independent transaction handles are guarded and roll back when recovery starts', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'h3-access-'));
  const raw = createRealSqliteTestDb(join(folder, 'app.db'), { independentTransactions: true });
  ensureAppDatabase(raw as never);
  const db = protectDatabase(raw as never, { startupDiagnostic: () => undefined });
  let readonly = false;
  const guarded = protectDatabase(raw as never, { startupDiagnostic: () => readonly ? 'FAILED' : undefined });
  try {
    await db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('a','p','QUEUED','768p',5,1,1)");
    });
    await expect(guarded.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM tasks');
      readonly = true;
      await tx.getFirstAsync('DELETE FROM tasks RETURNING id');
    })).rejects.toThrow('FAILED');
    expect(raw.getAllSync('SELECT id FROM tasks')).toHaveLength(1);
  } finally { raw.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('statements acquired before recovery cannot execute afterwards', async () => {
  const raw = createInitializedRealSqliteTestDb();
  const executeSync = jest.fn();
  const executeAsync = jest.fn();
  const finalizeSync = jest.fn();
  const db = protectDatabase({ ...raw, prepareSync: () => ({ executeSync, executeAsync, finalizeSync }) } as never, { startupDiagnostic: () => undefined });
  try {
    const statement = db.prepareSync('DELETE FROM tasks');
    markRecovery(db, 'FAILED', 1);
    expect(() => statement.executeSync()).toThrow('FAILED');
    await expect(statement.executeAsync()).rejects.toThrow('FAILED');
    statement.finalizeSync();
    expect(executeSync).not.toHaveBeenCalled();
    expect(executeAsync).not.toHaveBeenCalled();
    expect(finalizeSync).toHaveBeenCalled();
  } finally { raw.close(); }
});
