import { backupDatabaseSync, defaultDatabaseDirectory, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { Directory } from 'expo-file-system';

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

export type RestoreBackupDeps = {
  listNames(): string[];
  open(name: string): SQLiteDatabase;
  backup(options: { sourceDatabase: SQLiteDatabase; destDatabase: SQLiteDatabase }): void;
};

const expoRestoreBackupDeps: RestoreBackupDeps = {
  listNames: () => new Directory(defaultDatabaseDirectory).list().map((entry) => entry.name),
  open: (name) => openDatabaseSync(name),
  backup: (options) => backupDatabaseSync(options),
};

const FULL_BACKUP_NAME = /^autodl-h3-(?:v\d+-to-v\d+|release-[A-Za-z0-9._-]+-[0-9a-f]{12})-(\d+)\.backup\.db$/;

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

export function createReleaseBackup(
  source: SQLiteDatabase,
  releaseId: string,
  manifestHash: string,
  deps: BackupDeps = expoBackupDeps,
): string {
  const safeReleaseId = releaseId.replace(/[^A-Za-z0-9._-]/g, '-');
  const name = `autodl-h3-release-${safeReleaseId}-${manifestHash.slice(0, 12)}-${deps.now()}.backup.db`;
  const destination = deps.open(name);
  try {
    deps.backup({ sourceDatabase: source, destDatabase: destination });
    return name;
  } finally {
    destination.closeSync();
  }
}

export function listFullDatabaseBackups(
  deps: Pick<RestoreBackupDeps, 'listNames'> = expoRestoreBackupDeps,
): string[] {
  return deps.listNames()
    .map((name) => ({ name, timestamp: Number(FULL_BACKUP_NAME.exec(name)?.[1] ?? -1) }))
    .filter((item) => item.timestamp >= 0)
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((item) => item.name);
}

export function restoreFullDatabaseBackup(
  destination: SQLiteDatabase,
  backupName: string,
  deps: RestoreBackupDeps = expoRestoreBackupDeps,
): void {
  if (!FULL_BACKUP_NAME.test(backupName) || !deps.listNames().includes(backupName)) {
    throw new Error('REGISTRY_RELEASE_BACKUP_NOT_FOUND');
  }
  const source = deps.open(backupName);
  try {
    const check = source.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (check?.integrity_check !== 'ok') throw new Error('REGISTRY_RELEASE_BACKUP_INVALID');
    deps.backup({ sourceDatabase: source, destDatabase: destination });
  } finally {
    source.closeSync();
  }
}
