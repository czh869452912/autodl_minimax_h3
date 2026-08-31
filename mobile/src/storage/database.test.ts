import { APP_SCHEMA_VERSION, ensureAppDatabase } from './database';

test('resets only app-owned tables when schema epoch changes', () => {
  const calls: string[] = [];
  const db = {
    execSync: (sql: string) => calls.push(sql),
    getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION - 1 }),
  };
  ensureAppDatabase(db as never);
  expect(calls).toContain('DROP TABLE IF EXISTS tasks');
  expect(calls).toContain('DROP TABLE IF EXISTS media_assets');
  expect(calls).not.toContain(expect.stringContaining('media_store'));
  expect(calls).toContain(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
});

test('does not reset a current schema epoch', () => {
  const execSync = jest.fn();
  ensureAppDatabase({ execSync, getFirstSync: () => ({ user_version: APP_SCHEMA_VERSION }) } as never);
  expect(execSync).not.toHaveBeenCalled();
});
