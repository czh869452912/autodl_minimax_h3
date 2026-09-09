import { openDatabaseSync } from 'expo-sqlite';
import type { AppDatabase } from './appDatabase';
import { ensureAppDatabase } from './database';
import { createPreMigrationBackup } from './backup';
import { AppMigrationError } from './recovery';
import { withRetryingQueries } from './sqliteBusy';
import { protectDatabase } from './databaseAccess';

let sharedDatabase: AppDatabase | undefined;
export type DatabaseStartupState =
  | { mode: 'writable' }
  | { mode: 'legacy' }
  | { mode: 'readonly'; diagnostic: string; allowReset: boolean };
let startupState: DatabaseStartupState = { mode: 'writable' };

/** Return the single application database handle for this JS runtime. */
export function getDatabase(): AppDatabase {
  if (!sharedDatabase) {
    const raw = openDatabaseSync('autodl-h3.db');
    try {
      const result = ensureAppDatabase(raw, {
        backup: (db, fromVersion, toVersion) => { createPreMigrationBackup(db, fromVersion, toVersion); },
      });
      if (result?.mode === 'legacy') startupState = { mode: 'legacy' };
      else if (result?.mode === 'future') {
        startupState = { mode: 'readonly', diagnostic: 'SCHEMA_VERSION_NEWER_THAN_APP', allowReset: false };
      } else startupState = { mode: 'writable' };
    } catch (error) {
      if (!(error instanceof AppMigrationError)) throw error;
      startupState = { mode: 'readonly', diagnostic: error.diagnostic, allowReset: true };
    }
    let retired = false;
    sharedDatabase = protectDatabase(withRetryingQueries(raw), {
      startupDiagnostic: () => retired ? 'DATABASE_HANDLE_RETIRED' : startupState.mode === 'readonly' ? startupState.diagnostic : startupState.mode === 'legacy' ? 'LEGACY_DATABASE_REQUIRES_RESET' : undefined,
      didReset: () => { retired = true; sharedDatabase = undefined; startupState = { mode: 'writable' }; },
    });
  }
  return sharedDatabase;
}

export function getDatabaseStartupState(): DatabaseStartupState {
  return startupState;
}

export function resetDatabaseClientForTests(): void {
  sharedDatabase = undefined;
  startupState = { mode: 'writable' };
}
