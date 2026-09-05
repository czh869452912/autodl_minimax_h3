import type { SQLiteDatabase } from 'expo-sqlite';
import { RECOVERY_TABLE } from './schema';

export type AppRecoveryState = { readonly: true; diagnostic: string; createdAt: number };

export class AppMigrationError extends Error {
  constructor(public readonly diagnostic: string, public readonly fromVersion: number, options?: { cause?: unknown }) {
    super(diagnostic, options);
    this.name = 'AppMigrationError';
  }
}

export function migrationDiagnostic(fromVersion: number, toVersion: number): string {
  return `MIGRATION_${fromVersion}_TO_${toVersion}_FAILED`;
}

export function getRecoveryState(db: SQLiteDatabase | undefined): AppRecoveryState | undefined {
  if (!db || typeof (db as { getFirstSync?: unknown }).getFirstSync !== 'function') return undefined;
  try {
    const row = db.getFirstSync<{ diagnostic: string; created_at: number }>(
      `SELECT diagnostic, created_at FROM ${RECOVERY_TABLE} WHERE id = 1 LIMIT 1`,
    );
    if (!row || typeof row.diagnostic !== 'string' || row.diagnostic.length === 0) return undefined;
    const createdAt = Number(row.created_at);
    if (!Number.isFinite(createdAt)) return undefined;
    return { readonly: true, diagnostic: row.diagnostic, createdAt };
  } catch {
    return undefined;
  }
}

export async function getRecoveryStateAsync(db: SQLiteDatabase | undefined): Promise<AppRecoveryState | undefined> {
  if (!db) return undefined;
  if (typeof db.getFirstAsync !== 'function') throw new Error('APP_DATABASE_ASYNC_RECOVERY_UNAVAILABLE');
  const row = await db.getFirstAsync<{ diagnostic: string; created_at: number }>(
    `SELECT diagnostic, created_at FROM ${RECOVERY_TABLE} WHERE id = 1 LIMIT 1`,
  );
  if (!row || typeof row.diagnostic !== 'string' || row.diagnostic.length === 0) return undefined;
  const createdAt = Number(row.created_at);
  if (!Number.isFinite(createdAt)) return undefined;
  return { readonly: true, diagnostic: row.diagnostic, createdAt };
}

export function markRecovery(db: SQLiteDatabase, diagnostic: string, createdAt: number): void {
  try {
    db.execSync(`CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE} (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    db.runSync(`INSERT OR REPLACE INTO ${RECOVERY_TABLE} (id, diagnostic, created_at) VALUES (1, ?, ?)`, diagnostic, createdAt);
  } catch {
    // Preserve the migration error when recovery persistence is unavailable.
  }
}
