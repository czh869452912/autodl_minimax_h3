import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local application data is intentionally disposable. Bump this epoch when
 * changing the local data model; the next launch drops only app-owned tables.
 * The reset removes App-owned metadata only. External system-gallery content
 * is never touched; private cache files remain eligible for OS reclamation.
 */
export const APP_SCHEMA_VERSION = 5;
const RECOVERY_TABLE = 'app_database_recovery';
export type AppRecoveryState = { readonly: true; diagnostic: string; createdAt: number };
export type AppDatabaseOptions = { backup?: () => void };

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
  'app_scheduler_leases',
  RECOVERY_TABLE,
];

const APP_CREATE_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS workflow_jobs (id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL, workflow_version TEXT NOT NULL, workflow_hash TEXT NOT NULL, adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, input_json TEXT NOT NULL, output_mapping_json TEXT, remote_json TEXT, status TEXT NOT NULL, error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, execution_duration REAL)',
  'CREATE TABLE IF NOT EXISTS workflow_artifacts (id TEXT NOT NULL, job_id TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT, mime TEXT, metadata_json TEXT, PRIMARY KEY (job_id, id))',
  'CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, source_url TEXT NOT NULL, local_path TEXT, poster_path TEXT, mime_type TEXT NOT NULL, width INTEGER, height INTEGER, duration_ms INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, artifact_id TEXT, job_id TEXT, workflow_id TEXT, kind TEXT NOT NULL DEFAULT \'video\', export_status TEXT)',
  'CREATE TABLE IF NOT EXISTS media_deliveries (id TEXT PRIMARY KEY NOT NULL, asset_id TEXT NOT NULL, target TEXT NOT NULL, uri TEXT, status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, duration INTEGER NOT NULL, seed TEXT, images_json TEXT, audios_json TEXT, video_url TEXT, local_uri TEXT, thumbnail_url TEXT, download_state TEXT NOT NULL DEFAULT \'IDLE\', download_error TEXT, download_progress REAL, gallery_uri TEXT, export_state TEXT NOT NULL DEFAULT \'NOT_REQUESTED\', export_error TEXT, exported_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, execution_duration INTEGER, workflow_id TEXT, workflow_version TEXT, workflow_hash TEXT, adapter_id TEXT, adapter_version TEXT, input_json TEXT, sync_error TEXT, last_sync_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS workflow_registry (workflow_id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, source TEXT NOT NULL, trust TEXT NOT NULL, definition_json TEXT NOT NULL, installed_at INTEGER NOT NULL, repository TEXT, ref TEXT, commit_sha TEXT, PRIMARY KEY (workflow_id, version))',
  'CREATE TABLE IF NOT EXISTS workflow_registry_active (workflow_id TEXT PRIMARY KEY NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, previous_version TEXT, previous_hash TEXT)',
  'CREATE TABLE IF NOT EXISTS prompt_drafts (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, attachment_ids_json TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS agent_threads (thread_id TEXT PRIMARY KEY NOT NULL, messages_json TEXT NOT NULL, state_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, custom_title TEXT)',
  'CREATE TABLE IF NOT EXISTS app_scheduler_leases (lease_key TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)',
];

export function readAppSchemaVersion(db: SQLiteDatabase | undefined): number | undefined {
  if (!db || typeof (db as unknown as { getFirstSync?: unknown }).getFirstSync !== 'function') return undefined;
  try {
    const row = db.getFirstSync<{ user_version?: number }>('PRAGMA user_version') as { user_version?: number } | null | undefined;
    return row && typeof row.user_version === 'number' ? row.user_version : undefined;
  } catch {
    return undefined;
  }
}

export function isLegacyAppDatabase(db: SQLiteDatabase | undefined): boolean {
  const version = readAppSchemaVersion(db);
  if (version === undefined || version === APP_SCHEMA_VERSION) return false;
  const getAllSync = (db as unknown as { getAllSync?: (sql: string) => Array<{ name?: string }> }).getAllSync;
  if (typeof getAllSync !== 'function') return true;
  try {
    const rows = getAllSync.call(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
    return rows.some((row) => typeof row.name === 'string' && APP_TABLES.includes(row.name));
  } catch {
    return true;
  }
}

export function resetAppDatabase(db: SQLiteDatabase | undefined): void {
  if (!db || typeof (db as unknown as { execSync?: unknown }).execSync !== 'function') return;
  const transaction = (db as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
  const reset = () => {
    for (const table of APP_TABLES) db.execSync(`DROP TABLE IF EXISTS ${table}`);
    for (const statement of APP_CREATE_STATEMENTS) db.execSync(statement);
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

function withTransaction(db: SQLiteDatabase, callback: () => void): void {
  const transaction = (db as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
  if (transaction) transaction.call(db, callback);
  else {
    db.execSync('BEGIN');
    try { callback(); db.execSync('COMMIT'); }
    catch (error) { try { db.execSync('ROLLBACK'); } catch { /* best effort */ } throw error; }
  }
}

function markRecovery(db: SQLiteDatabase, diagnostic: string): void {
  try {
    db.execSync(`CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE} (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    db.runSync(`INSERT OR REPLACE INTO ${RECOVERY_TABLE} (id, diagnostic, created_at) VALUES (1, ?, ?)`, diagnostic, Date.now());
  } catch { /* preserve the original migration failure */ }
}

export function getAppRecoveryState(db: SQLiteDatabase | undefined): AppRecoveryState | undefined {
  if (!db || typeof (db as unknown as { getFirstSync?: unknown }).getFirstSync !== 'function') return undefined;
  try {
    const row = db.getFirstSync<{ readonly?: number; diagnostic?: string; created_at?: number }>(`SELECT 1 AS readonly, diagnostic, created_at FROM ${RECOVERY_TABLE} WHERE id = 1 LIMIT 1`) as { readonly?: number; diagnostic?: string; created_at?: number } | null | undefined;
    if (!row || row.readonly !== 1 || typeof row.diagnostic !== 'string') return undefined;
    return { readonly: true, diagnostic: row.diagnostic, createdAt: Number(row.created_at ?? 0) };
  } catch { return undefined; }
}

export function assertAppDatabaseWritable(db: SQLiteDatabase | undefined): void {
  const recovery = getAppRecoveryState(db);
  if (recovery) throw new Error(`APP_DATABASE_READ_ONLY: ${recovery.diagnostic}`);
}

export function ensureAppDatabase(db: SQLiteDatabase | undefined, options: AppDatabaseOptions = {}): void {
  if (!db) return;
  if (typeof (db as unknown as { execSync?: unknown }).execSync !== 'function') return;
  const version = readAppSchemaVersion(db);
  if (version === undefined) return;
  if (version === APP_SCHEMA_VERSION) return;
  if (version != null && version > APP_SCHEMA_VERSION) return;
  const freshInstall = version === 0 && !isLegacyAppDatabase(db);
  if (!freshInstall && version !== APP_SCHEMA_VERSION - 1) return;
  try {
    if (!freshInstall) options.backup?.();
    withTransaction(db, () => {
      for (const statement of APP_CREATE_STATEMENTS) db.execSync(statement);
      db.execSync(`CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE} (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      db.execSync(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
    });
  } catch (error) {
    markRecovery(db, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
