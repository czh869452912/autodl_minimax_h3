import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local application data is intentionally disposable. Bump this epoch when
 * changing the local data model; the next launch drops only app-owned tables.
 * The reset removes App-owned metadata only. External system-gallery content
 * is never touched; private cache files remain eligible for OS reclamation.
 */
export const APP_SCHEMA_VERSION = 4;

const APP_TABLES = [
  'workflow_artifacts',
  'workflow_jobs',
  'media_deliveries',
  'media_assets',
  'tasks',
  'workflow_registry_active',
  'workflow_registry',
  'prompt_drafts',
  'agent_threads',
];

export function ensureAppDatabase(db: SQLiteDatabase | undefined): void {
  if (!db) return;
  if (typeof (db as unknown as { execSync?: unknown }).execSync !== 'function') return;
  if (typeof (db as unknown as { getFirstSync?: unknown }).getFirstSync !== 'function') return;
  let version = 0;
  try {
    const row = db.getFirstSync<{ user_version?: number }>('PRAGMA user_version') as { user_version?: number } | null | undefined;
    if (!row || typeof row.user_version !== 'number') return;
    version = row.user_version;
  } catch {
    // Test doubles and very old SQLite wrappers may not expose PRAGMA reads.
  }
  if (version === APP_SCHEMA_VERSION) return;

  const transaction = (db as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
  const reset = () => {
    for (const table of APP_TABLES) db.execSync(`DROP TABLE IF EXISTS ${table}`);
    db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
  };
  if (transaction) transaction.call(db, reset);
  else {
    db.execSync('BEGIN');
    try {
      reset();
      db.execSync('COMMIT');
    } catch (error) {
      try { db.execSync('ROLLBACK'); } catch { /* best effort */ }
      throw error;
    }
  }
}
