import type { SQLiteDatabase } from 'expo-sqlite';
import { APP_SCHEMA_VERSION, APP_TABLES } from './schema';
import { getRecoveryState, getRecoveryStateAsync, type AppRecoveryState } from './recovery';
import { applyCurrentSchema, runAppMigrations, type AppDatabaseMigrationOptions } from './migrations/runner';

export { APP_SCHEMA_VERSION };
export type { AppRecoveryState };
export type AppDatabaseOptions = AppDatabaseMigrationOptions;

export function readAppSchemaVersion(db: SQLiteDatabase | undefined): number | undefined {
  if (!db || typeof (db as { getFirstSync?: unknown }).getFirstSync !== 'function') return undefined;
  try {
    const row = db.getFirstSync<{ user_version?: number }>('PRAGMA user_version');
    return typeof row?.user_version === 'number' ? row.user_version : undefined;
  } catch {
    return undefined;
  }
}

export function isLegacyAppDatabase(db: SQLiteDatabase | undefined): boolean {
  const current = readAppSchemaVersion(db);
  if (current === undefined || current === APP_SCHEMA_VERSION || current > APP_SCHEMA_VERSION) return false;
  const getAllSync = (db as { getAllSync?: (sql: string) => Array<{ name?: string }> }).getAllSync;
  if (typeof getAllSync !== 'function') return true;
  try {
    const rows = getAllSync.call(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
    return rows.some((row) => typeof row.name === 'string' && (APP_TABLES as readonly string[]).includes(row.name));
  } catch {
    return true;
  }
}

function withTransaction(db: SQLiteDatabase, work: () => void): void {
  if (typeof db.withTransactionSync === 'function') {
    db.withTransactionSync(work);
    return;
  }
  db.execSync('BEGIN');
  try {
    work();
    db.execSync('COMMIT');
  } catch (error) {
    try { db.execSync('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  }
}

export function resetAppDatabase(db: SQLiteDatabase | undefined): void {
  if (!db || typeof (db as { execSync?: unknown }).execSync !== 'function') return;
  withTransaction(db, () => {
    for (const table of APP_TABLES) db.execSync(`DROP TABLE IF EXISTS ${table}`);
    applyCurrentSchema(db);
    db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
  });
}

export function getAppRecoveryState(db: SQLiteDatabase | undefined): AppRecoveryState | undefined {
  return getRecoveryState(db);
}

export async function getAppRecoveryStateAsync(db: SQLiteDatabase | undefined): Promise<AppRecoveryState | undefined> {
  return getRecoveryStateAsync(db);
}

export function assertAppDatabaseWritable(db: SQLiteDatabase | undefined): void {
  const recovery = getRecoveryState(db);
  if (recovery) throw new Error(`APP_DATABASE_READ_ONLY: ${recovery.diagnostic}`);
}

export async function assertAppDatabaseWritableAsync(db: SQLiteDatabase | undefined): Promise<void> {
  const recovery = await getRecoveryStateAsync(db);
  if (recovery) throw new Error(`APP_DATABASE_READ_ONLY: ${recovery.diagnostic}`);
}

export function ensureAppDatabase(db: SQLiteDatabase | undefined, options: AppDatabaseOptions = {}) {
  if (!db || typeof (db as { execSync?: unknown }).execSync !== 'function') return undefined;
  return runAppMigrations(db, options);
}
