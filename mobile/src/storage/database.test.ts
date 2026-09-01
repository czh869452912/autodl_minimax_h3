import { APP_SCHEMA_VERSION, ensureAppDatabase, getAppRecoveryState, isLegacyAppDatabase, resetAppDatabase } from './database';

test('migrates the previous schema additively inside a transaction', () => {
  const calls: string[] = [];
  const backup = jest.fn();
  const db = {
    execSync: (sql: string) => calls.push(sql),
    getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION - 1 }),
    withTransactionSync: jest.fn((callback: () => void) => callback()),
  };
  ensureAppDatabase(db as never, { backup });
  expect(backup).toHaveBeenCalledTimes(1);
  expect(db.withTransactionSync).toHaveBeenCalledTimes(1);
  expect(calls.some((sql) => sql.includes('DROP TABLE'))).toBe(false);
  expect(calls).toContain(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
});

test('does not mutate an older legacy schema before confirmation', () => {
  const execSync = jest.fn();
  const db = { execSync, getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION - 2 }) };
  ensureAppDatabase(db as never);
  expect(execSync).not.toHaveBeenCalled();
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

test('records read-only recovery state when migration fails', () => {
  const calls: string[] = [];
  const db = {
    execSync: (sql: string) => calls.push(sql),
    getFirstSync: jest.fn((sql: string) => sql.includes('user_version') ? { user_version: APP_SCHEMA_VERSION - 1 } : { readonly: 1, diagnostic: 'migration failed', created_at: 1 }),
    withTransactionSync: jest.fn(() => { throw new Error('migration failed'); }),
  };
  expect(() => ensureAppDatabase(db as never)).toThrow('migration failed');
  expect(getAppRecoveryState(db as never)).toMatchObject({ readonly: true, diagnostic: expect.stringContaining('migration failed') });
  expect(calls.some((sql) => sql.includes('DROP TABLE'))).toBe(false);
});
