import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { ensureAppDatabase } from './database';

let sharedDatabase: SQLiteDatabase | undefined;

/** Return the single application database handle for this JS runtime. */
export function getDatabase(): SQLiteDatabase {
  if (!sharedDatabase) {
    sharedDatabase = openDatabaseSync('autodl-h3.db');
    ensureAppDatabase(sharedDatabase);
  }
  return sharedDatabase;
}

export function resetDatabaseClientForTests(): void {
  sharedDatabase = undefined;
}
