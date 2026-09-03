import { backupDatabaseSync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

export type BackupDeps = {
  now(): number;
  open(name: string): SQLiteDatabase;
  backup(options: { sourceDatabase: SQLiteDatabase; destDatabase: SQLiteDatabase }): void;
};

const expoBackupDeps: BackupDeps = {
  now: Date.now,
  open: (name) => openDatabaseSync(name),
  backup: (options) => backupDatabaseSync(options),
};

export function createPreMigrationBackup(
  source: SQLiteDatabase,
  fromVersion: number,
  toVersion: number,
  deps: BackupDeps = expoBackupDeps,
): string {
  const name = `autodl-h3-v${fromVersion}-to-v${toVersion}-${deps.now()}.backup.db`;
  const destination = deps.open(name);
  try {
    deps.backup({ sourceDatabase: source, destDatabase: destination });
    return name;
  } finally {
    destination.closeSync();
  }
}
