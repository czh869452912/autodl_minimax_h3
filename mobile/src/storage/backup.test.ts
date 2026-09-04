import {
  createPreMigrationBackup,
  createReleaseBackup,
  listFullDatabaseBackups,
  restoreFullDatabaseBackup,
  type BackupDeps,
  type RestoreBackupDeps,
} from './backup';

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
  const deps: RestoreBackupDeps = {
    listNames: () => ['autodl-h3-v6-to-v7-200.backup.db'],
    open: jest.fn(() => source as never),
    backup: jest.fn(),
  };
  return { source, deps };
}

test('restores a verified complete database and closes the source', () => {
  const destination = {} as never;
  const { source, deps } = restoreFixture();
  restoreFullDatabaseBackup(destination, 'autodl-h3-v6-to-v7-200.backup.db', deps);
  expect(source.getFirstSync).toHaveBeenCalledWith('PRAGMA integrity_check');
  expect(deps.backup).toHaveBeenCalledWith({ sourceDatabase: source, destDatabase: destination });
  expect(source.closeSync).toHaveBeenCalledTimes(1);
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
