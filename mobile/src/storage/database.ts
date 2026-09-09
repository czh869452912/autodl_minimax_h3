import type { AppDatabase } from './appDatabase';
import { APP_SCHEMA_VERSION, APP_TABLES } from './schema';
import { getRecoveryState, getRecoveryStateAsync, type AppRecoveryState } from './recovery';
import { applyCurrentSchema, runAppMigrations, type AppDatabaseMigrationOptions } from './migrations/runner';
import { maintenanceDatabase, didResetDatabase, checkDatabaseAccess, checkDatabaseAccessAsync } from './databaseAccess';

export { APP_SCHEMA_VERSION };
export type { AppRecoveryState };
export type AppDatabaseOptions = AppDatabaseMigrationOptions;

export function readAppSchemaVersion(db: AppDatabase | undefined): number | undefined {
  if (!db || typeof (db as { getFirstSync?: unknown }).getFirstSync !== 'function') return undefined;
  try {
    const row = db.getFirstSync<{ user_version?: number }>('PRAGMA user_version');
    return typeof row?.user_version === 'number' ? row.user_version : undefined;
  } catch {
    return undefined;
  }
}

export function isLegacyAppDatabase(db: AppDatabase | undefined): boolean {
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

function withTransaction(db: AppDatabase, work: () => void): void {
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

export function resetAppDatabase(db: AppDatabase | undefined): void {
  if (!db || typeof (db as { execSync?: unknown }).execSync !== 'function') return;
  const application = db;
  db = maintenanceDatabase(db);
  if ((readAppSchemaVersion(db) ?? 0) > APP_SCHEMA_VERSION) throw new Error('APP_DATABASE_READ_ONLY: SCHEMA_VERSION_NEWER_THAN_APP');
  withTransaction(db, () => {
    for (const table of APP_TABLES) db.execSync(`DROP TABLE IF EXISTS ${table}`);
    applyCurrentSchema(db);
    db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
  });
  didResetDatabase(application);
}

export function getAppRecoveryState(db: AppDatabase | undefined): AppRecoveryState | undefined {
  return getRecoveryState(db);
}

export async function getAppRecoveryStateAsync(db: AppDatabase | undefined): Promise<AppRecoveryState | undefined> {
  return getRecoveryStateAsync(db);
}

export function assertAppDatabaseWritable(db: AppDatabase | undefined): void {
  if (db && checkDatabaseAccess(db)) return;
  const recovery = getRecoveryState(db);
  if (recovery) throw new Error(`APP_DATABASE_READ_ONLY: ${recovery.diagnostic}`);
}

export async function assertAppDatabaseWritableAsync(db: AppDatabase | undefined): Promise<void> {
  if (db && await checkDatabaseAccessAsync(db)) return;
  const recovery = await getRecoveryStateAsync(db);
  if (recovery) throw new Error(`APP_DATABASE_READ_ONLY: ${recovery.diagnostic}`);
}

export function ensureAppDatabase(db: AppDatabase | undefined, options: AppDatabaseOptions = {}) {
  if (!db || typeof (db as { execSync?: unknown }).execSync !== 'function') return undefined;
  return runAppMigrations(db, options);
}
