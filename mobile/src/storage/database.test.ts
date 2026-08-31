import { APP_SCHEMA_VERSION, ensureAppDatabase, isLegacyAppDatabase, resetAppDatabase } from './database';

test('does not reset an old schema before user confirmation', () => {
  const calls: string[] = [];
  const db = {
    execSync: (sql: string) => calls.push(sql),
    getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION - 1 }),
  };
  ensureAppDatabase(db as never);
  expect(calls).toHaveLength(0);
});

test('does not reset a current schema epoch', () => {
  const execSync = jest.fn();
  ensureAppDatabase({ execSync, getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION }) } as never);
  expect(execSync).not.toHaveBeenCalled();
});

test('detects old schema without mutating it', () => {
  const execSync = jest.fn();
  const db = { execSync, getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION - 1 }) };
  expect(isLegacyAppDatabase(db as never)).toBe(true);
  expect(execSync).not.toHaveBeenCalled();
});

test('resetAppDatabase binds transaction context', () => {
  const db = {
    execSync: jest.fn(),
    withTransactionSync(this: unknown, callback: () => void) {
      if (this !== db) throw new TypeError('database context missing');
      callback();
    },
  };
  expect(() => resetAppDatabase(db as never)).not.toThrow();
  expect(db.execSync).toHaveBeenCalledWith(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
});
