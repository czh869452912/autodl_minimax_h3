import { createRealSqliteTestDb } from '../test/realSqlite';
import { createWorkflowRegistry } from '../workflows/registry/repository';
import h3V100 from '../workflows/definitions/autodl/minimax-h3-i2v-15s.json';
import { canonicalizeDefinition } from '../workflows/registry/canonicalize';
import { LEGACY_DEFINITION_IDENTITY_V1 } from '../workflows/registry/identity';
import { APP_SCHEMA_VERSION, ensureAppDatabase, getAppRecoveryState, isLegacyAppDatabase, readAppSchemaVersion, resetAppDatabase } from './database';

test('initializes a fresh database with the complete current schema', () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    const names = db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining([
      'workflow_artifacts', 'workflow_jobs', 'media_deliveries', 'media_assets', 'tasks',
      'workflow_registry_releases', 'workflow_registry_active', 'workflow_registry', 'prompt_drafts', 'agent_threads',
      'app_scheduler_leases', 'app_database_recovery',
    ]));
    expect(db.getAllSync<{ name: string }>('PRAGMA table_info("workflow_registry")').map((row) => row.name))
      .toContain('hash_scheme');
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

test('does not stamp a version-zero database containing only a legacy registry table', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync('CREATE TABLE workflow_registry (workflow_id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, source TEXT NOT NULL, trust TEXT NOT NULL, definition_json TEXT NOT NULL, installed_at INTEGER NOT NULL, PRIMARY KEY (workflow_id, version))');
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(0);
  } finally {
    db.close();
  }
});

test('fresh initialization supports workflow registry activation', async () => {
  const db = createRealSqliteTestDb();
  try {
    ensureAppDatabase(db as never);
    const registry = createWorkflowRegistry(db as never);
    await registry.installAndActivate!({
      workflowId: 'demo', version: '1.0.0', contentHash: 'abc', hashScheme: 'workflow-package/without-declared-hash+sorted-json@1', source: 'builtin', trust: 'builtin', definitionJson: '{}', installedAt: 1,
    });
    await expect(registry.getActive('demo')).resolves.toMatchObject({
      workflowId: 'demo',
      contentHash: 'abc',
      hashScheme: 'workflow-package/without-declared-hash+sorted-json@1',
    });
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
      h3V100.id, h3V100.version,
      '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
      'builtin', 'builtin', canonicalizeDefinition(h3V100), 1,
    );
    db.execSync('PRAGMA user_version = 4');
    ensureAppDatabase(db as never);
    expect(readAppSchemaVersion(db as never)).toBe(APP_SCHEMA_VERSION);
    expect(db.getFirstSync<{ workflow_id: string }>('SELECT workflow_id FROM workflow_registry WHERE workflow_id = ?', h3V100.id)?.workflow_id).toBe(h3V100.id);
    expect(db.getFirstSync<{ hash_scheme: string }>('SELECT hash_scheme FROM workflow_registry WHERE workflow_id = ?', h3V100.id)?.hash_scheme)
      .toBe(LEGACY_DEFINITION_IDENTITY_V1);
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
    getAllSync: () => [],
    runSync: jest.fn(),
    withTransactionSync: jest.fn((callback: () => void) => callback()),
  };
  ensureAppDatabase(db as never, { backup });
  expect(backup).toHaveBeenCalledTimes(1);
  expect(db.withTransactionSync).toHaveBeenCalledTimes(1);
  expect(calls.some((sql) => sql.includes('DROP TABLE'))).toBe(false);
  expect(calls).toContain(`PRAGMA user_version = ${APP_SCHEMA_VERSION}`);
});

test('does not mutate a pre-v4 legacy schema before confirmation', () => {
  const execSync = jest.fn();
  const db = { execSync, getFirstSync: () => ({ user_version: 3 }) };
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
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
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
