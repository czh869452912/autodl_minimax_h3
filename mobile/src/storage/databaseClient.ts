import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { ensureAppDatabase } from './database';
import { createPreMigrationBackup } from './backup';
import { AppMigrationError } from './recovery';
import { withRetryingQueries } from './sqliteBusy';

let sharedDatabase: SQLiteDatabase | undefined;
export type DatabaseStartupState =
  | { mode: 'writable' }
  | { mode: 'legacy' }
  | { mode: 'readonly'; diagnostic: string; allowReset: boolean };
let startupState: DatabaseStartupState = { mode: 'writable' };

/** Return the single application database handle for this JS runtime. */
export function getDatabase(): SQLiteDatabase {
  if (!sharedDatabase) {
    sharedDatabase = openDatabaseSync('autodl-h3.db');
    try {
      const result = ensureAppDatabase(sharedDatabase, {
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
    sharedDatabase = withRetryingQueries(sharedDatabase);
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
