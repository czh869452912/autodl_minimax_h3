import type { SQLiteDatabase } from 'expo-sqlite';
import { APP_SCHEMA_VERSION, APP_TABLES, CURRENT_SCHEMA_STATEMENTS } from '../schema';
import { AppMigrationError, getRecoveryState, markRecovery, migrationDiagnostic } from '../recovery';
import type { MigrationContext, MigrationResult, MigrationStep } from './types';
import { v5Registry } from './v5Registry';
import { v6DurableExecutor } from './v6DurableExecutor';
import { v7RegistryRelease } from './v7RegistryRelease';
import { v8TaskRefresh } from './v8TaskRefresh';

export type AppDatabaseMigrationOptions = {
  backup?: (db: SQLiteDatabase, fromVersion: number, toVersion: number) => void;
  now?: () => number;
};

const steps = new Map<number, MigrationStep>([
  [v5Registry.fromVersion, v5Registry],
  [v6DurableExecutor.fromVersion, v6DurableExecutor],
  [v7RegistryRelease.fromVersion, v7RegistryRelease],
  [v8TaskRefresh.fromVersion, v8TaskRefresh],
]);

function version(db: SQLiteDatabase): number {
  return Number(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
}

function hasAppTable(db: SQLiteDatabase): boolean {
  const names = db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return names.some((row) => (APP_TABLES as readonly string[]).includes(row.name));
}

function transaction(db: SQLiteDatabase, work: () => void): void {
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

function context(db: SQLiteDatabase): MigrationContext {
  return {
    db,
    exec: (sql) => db.execSync(sql),
    hasColumn: (table, column) => db.getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`).some((row) => row.name === column),
  };
}

export function applyCurrentSchema(db: SQLiteDatabase): void {
  for (const statement of CURRENT_SCHEMA_STATEMENTS) db.execSync(statement);
  v6DurableExecutor.apply(context(db));
  v7RegistryRelease.apply(context(db));
  v8TaskRefresh.apply(context(db));
}

export function runAppMigrations(db: SQLiteDatabase, options: AppDatabaseMigrationOptions = {}): MigrationResult {
  const fromVersion = version(db);
  const recovery = getRecoveryState(db);
  if (recovery) throw new AppMigrationError(recovery.diagnostic, fromVersion);
  if (fromVersion === APP_SCHEMA_VERSION) {
    return { mode: 'writable', fromVersion, toVersion: fromVersion, migrated: false };
  }
  if (fromVersion > APP_SCHEMA_VERSION) return { mode: 'future', fromVersion };
  const fresh = fromVersion === 0 && !hasAppTable(db);
  if (!fresh && fromVersion < 4) return { mode: 'legacy', fromVersion };
  const now = options.now ?? Date.now;
  if (!fresh && options.backup) {
    try {
      options.backup(db, fromVersion, APP_SCHEMA_VERSION);
    } catch (cause) {
      const diagnostic = `BACKUP_${fromVersion}_TO_${APP_SCHEMA_VERSION}_FAILED`;
      markRecovery(db, diagnostic, now());
      throw new AppMigrationError(diagnostic, fromVersion, { cause });
    }
  }
  try {
    transaction(db, () => {
      if (fresh) {
        applyCurrentSchema(db);
      } else {
        let current = fromVersion;
        while (current < APP_SCHEMA_VERSION) {
          const step = steps.get(current);
          if (!step) throw new Error(`migration step missing for v${current}`);
          step.apply(context(db));
          current = step.toVersion;
        }
      }
      db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
    });
  } catch (cause) {
    const diagnostic = migrationDiagnostic(fromVersion, APP_SCHEMA_VERSION);
    markRecovery(db, diagnostic, now());
    throw new AppMigrationError(diagnostic, fromVersion, { cause });
  }
  return { mode: 'writable', fromVersion, toVersion: APP_SCHEMA_VERSION, migrated: true };
}
