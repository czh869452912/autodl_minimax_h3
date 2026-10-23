import {
  createPreMigrationBackup,
  databaseDirectoryUri,
  createReleaseBackup,
  listFullDatabaseBackups,
  restoreFullDatabaseBackup,
  type BackupDeps,
  type RestoreBackupDeps,
} from './backup';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';

test('normalizes the native SQLite directory path for the filesystem URI API', () => {
  expect(databaseDirectoryUri('/data/user/0/app/databases')).toBe('file:///data/user/0/app/databases');
  expect(databaseDirectoryUri('file:///data/user/0/app/databases')).toBe('file:///data/user/0/app/databases');
});

function fixture(overrides: Partial<BackupDeps> = {}) {
  const destination = { closeSync: jest.fn() };
  const deps: BackupDeps = {
    now: () => 123,
    open: jest.fn(() => destination as never),
    backup: jest.fn(),
    ...overrides,
  };
  return { destination, deps };
}

test('backs up into a versioned private SQLite database and closes it', () => {
  const source = { databasePath: '/private/autodl-h3.db' } as never;
  const { destination, deps } = fixture();
  expect(createPreMigrationBackup(source, 5, 6, deps)).toBe('autodl-h3-v5-to-v6-123.backup.db');
  expect(deps.open).toHaveBeenCalledWith('autodl-h3-v5-to-v6-123.backup.db');
  expect(deps.backup).toHaveBeenCalledWith({ sourceDatabase: source, destDatabase: destination });
  expect(destination.closeSync).toHaveBeenCalledTimes(1);
});

test('closes the destination when backup fails', () => {
  const { destination, deps } = fixture({
    backup: jest.fn(() => { throw new Error('disk full'); }),
  });
  expect(() => createPreMigrationBackup({} as never, 5, 6, deps)).toThrow('disk full');
  expect(destination.closeSync).toHaveBeenCalledTimes(1);
});

test('creates a sanitized release-labelled full backup', () => {
  const source = {} as never;
  const { deps } = fixture({ now: () => 456 });
  expect(createReleaseBackup(source, 'mobile/1.4.10 unsafe', 'abcdef0123456789', deps))
    .toBe('autodl-h3-release-mobile-1.4.10-unsafe-abcdef012345-456.backup.db');
});

test('lists only recognized full backups newest first', () => {
  expect(listFullDatabaseBackups({
    listNames: () => [
      'autodl-h3-v5-to-v6-100.backup.db',
      'ignore.db',
      'autodl-h3-release-mobile-1.4.10-abcdef012345-300.backup.db',
      'autodl-h3-v6-to-v7-200.backup.db',
    ],
  })).toEqual([
    'autodl-h3-release-mobile-1.4.10-abcdef012345-300.backup.db',
    'autodl-h3-v6-to-v7-200.backup.db',
    'autodl-h3-v5-to-v6-100.backup.db',
  ]);
});

function restoreFixture(integrity = 'ok') {
  const source = { getFirstSync: jest.fn(() => ({ integrity_check: integrity })), closeSync: jest.fn() };
  let stage: ReturnType<typeof createInitializedRealSqliteTestDb> & { closeSync: jest.Mock };
  const deps: RestoreBackupDeps = {
    listNames: () => ['autodl-h3-v6-to-v7-200.backup.db'],
    open: jest.fn(name => {
      if (name.includes('restore-stage')) {
        const db = createInitializedRealSqliteTestDb();
        stage = { ...db, closeSync: jest.fn(() => db.close()) };
        return stage as never;
      }
      return source as never;
    }),
    backup: jest.fn(),
  };
  return { source, deps, getStage: () => stage };
}

test('restores a verified complete database and closes the source', () => {
  const destination = {} as never;
  const { source, deps, getStage } = restoreFixture();
  restoreFullDatabaseBackup(destination, 'autodl-h3-v6-to-v7-200.backup.db', deps);
  expect(source.getFirstSync).toHaveBeenCalledWith('PRAGMA integrity_check');
  expect(deps.backup).toHaveBeenNthCalledWith(1, { sourceDatabase: source, destDatabase: getStage() });
  expect(deps.backup).toHaveBeenNthCalledWith(2, { sourceDatabase: getStage(), destDatabase: destination });
  expect(getStage().closeSync).toHaveBeenCalledTimes(1);
  expect(source.closeSync).toHaveBeenCalledTimes(1);
});

test('a failed staging restore never overwrites live data', () => {
  const { deps } = restoreFixture();
  const destination = {} as never;
  deps.backup = jest.fn(({ destDatabase }) => {
    destDatabase.execSync("CREATE TRIGGER injected BEFORE UPDATE ON creative_execution_state BEGIN SELECT RAISE(ABORT,'injected'); END");
  });
  expect(() => restoreFullDatabaseBackup(destination, 'autodl-h3-v6-to-v7-200.backup.db', deps)).toThrow('injected');
  expect(deps.backup).toHaveBeenCalledTimes(1);
  expect(deps.backup).not.toHaveBeenCalledWith(expect.objectContaining({ destDatabase: destination }));
});

test('rejects missing or invalid backups without overwriting the destination', () => {
  const missing = restoreFixture();
  expect(() => restoreFullDatabaseBackup({} as never, 'not-a-backup.db', missing.deps)).toThrow('REGISTRY_RELEASE_BACKUP_NOT_FOUND');
  expect(missing.deps.open).not.toHaveBeenCalled();
  expect(missing.deps.backup).not.toHaveBeenCalled();

  const invalid = restoreFixture('corrupt');
  expect(() => restoreFullDatabaseBackup({} as never, 'autodl-h3-v6-to-v7-200.backup.db', invalid.deps))
    .toThrow('REGISTRY_RELEASE_BACKUP_INVALID');
  expect(invalid.deps.backup).not.toHaveBeenCalled();
  expect(invalid.source.closeSync).toHaveBeenCalledTimes(1);
});
