import { createPreMigrationBackup, type BackupDeps } from './backup';

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
