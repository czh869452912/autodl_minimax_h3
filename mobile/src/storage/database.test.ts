import { createRealSqliteTestDb } from '../test/realSqlite';
import { createWorkflowRegistry } from '../workflows/registry/repository';
import { APP_SCHEMA_VERSION, ensureAppDatabase, getAppRecoveryState, isLegacyAppDatabase, readAppSchemaVersion, resetAppDatabase } from './database';

test('initializes a fresh database with the complete current schema', () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    const names = db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining([
      'workflow_artifacts', 'workflow_jobs', 'media_deliveries', 'media_assets', 'tasks',
      'workflow_registry_active', 'workflow_registry', 'prompt_drafts', 'agent_threads',
      'app_scheduler_leases', 'app_database_recovery',
    ]));
  } finally {
    db.close();
  }
});

test('fresh initialization is repeatable', () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    expect(db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE name='workflow_registry'")).toHaveLength(1);
  } finally {
    db.close();
  }
});

test('does not stamp a version-zero database containing legacy app data', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync('CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL)');
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(0);
    expect(db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE name='workflow_registry'")).toHaveLength(0);
  } finally {
    db.close();
  }
});

test('fresh initialization supports workflow registry activation', async () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    const registry = createWorkflowRegistry(db as never);
    await registry.installAndActivate({
      workflowId: 'demo', version: '1.0.0', contentHash: 'abc', source: 'builtin', trust: 'builtin', definitionJson: '{}', installedAt: 1,
    });
    await expect(registry.getActive('demo')).resolves.toMatchObject({ workflowId: 'demo', contentHash: 'abc' });
  } finally {
    db.close();
  }
});

test('migrates version four additively without deleting registry data', () => {
  const db = createRealSqliteTestDb();
  try {
    resetAppDatabase(db as never);
    db.runSync(
      'INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)',
      'demo', '1.0.0', 'abc', 'builtin', 'builtin', '{}', 1,
    );
    db.execSync('PRAGMA user_version = 4');
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    expect(db.getFirstSync<{ workflow_id: string }>("SELECT workflow_id FROM workflow_registry WHERE workflow_id='demo'")?.workflow_id).toBe('demo');
  } finally {
    db.close();
  }
});

test('reset clears a persisted recovery marker', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync("CREATE TABLE app_database_recovery (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL); INSERT INTO app_database_recovery VALUES (1, 'failed', 1)");
    resetAppDatabase(db as never);
    expect(getAppRecoveryState(db as never)).toBeUndefined();
  } finally {
    db.close();
  }
});

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
