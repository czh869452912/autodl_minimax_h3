const mockDatabase = { execSync: jest.fn(), getFirstSync: jest.fn(() => ({ user_version: 6 })) };
const mockEnsure = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDatabase),
  backupDatabaseSync: jest.fn(),
}));
jest.mock('./database', () => ({
  ensureAppDatabase: (...args: unknown[]) => mockEnsure(...args),
}));

import { AppMigrationError } from './recovery';
import { getDatabase, getDatabaseStartupState, resetDatabaseClientForTests } from './databaseClient';

beforeEach(() => {
  resetDatabaseClientForTests();
  mockEnsure.mockReset();
  mockEnsure.mockReturnValue({ mode: 'writable', fromVersion: 6, toVersion: 6, migrated: false });
});

test('returns one shared database handle for the app lifetime', () => {
  const first = getDatabase();
  const second = getDatabase();
  expect(second).toBe(first);
  expect(mockEnsure).toHaveBeenCalledTimes(1);
});

test('reports a writable startup after current-schema initialization', () => {
  getDatabase();
  expect(getDatabaseStartupState()).toEqual({ mode: 'writable' });
});

test('keeps the handle and exposes readonly state when migration fails', () => {
  mockEnsure.mockImplementationOnce(() => {
    throw new AppMigrationError('MIGRATION_5_TO_6_FAILED', 5);
  });
  expect(getDatabase()).toBe(getDatabase());
  expect(getDatabaseStartupState()).toEqual({
    mode: 'readonly',
    diagnostic: 'MIGRATION_5_TO_6_FAILED',
    allowReset: true,
  });
});

test('future schemas are readonly and cannot be reset from recovery UI', () => {
  mockEnsure.mockReturnValueOnce({ mode: 'future', fromVersion: 7 });
  expect(getDatabase()).toBe(getDatabase());
  expect(getDatabaseStartupState()).toEqual({
    mode: 'readonly',
    diagnostic: 'SCHEMA_VERSION_NEWER_THAN_APP',
    allowReset: false,
  });
});

test('legacy schemas remain in the explicit legacy flow', () => {
  mockEnsure.mockReturnValueOnce({ mode: 'legacy', fromVersion: 3 });
  getDatabase();
  expect(getDatabaseStartupState()).toEqual({ mode: 'legacy' });
});

test('does not hide non-migration startup failures', () => {
  mockEnsure.mockImplementationOnce(() => { throw new TypeError('unexpected'); });
  expect(() => getDatabase()).toThrow('unexpected');
});
