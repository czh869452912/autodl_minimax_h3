import { createRealSqliteTestDb } from '../../test/realSqlite';
import { APP_SCHEMA_VERSION, V5_SCHEMA_STATEMENTS } from '../schema';
import { AppMigrationError, getRecoveryState, markRecovery } from '../recovery';
import { runAppMigrations } from './runner';

function userVersion(db: ReturnType<typeof createRealSqliteTestDb>): number {
  return Number(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version);
}

function tableNames(db: ReturnType<typeof createRealSqliteTestDb>): string[] {
  return db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name);
}

function columnNames(db: ReturnType<typeof createRealSqliteTestDb>, table: string): string[] {
  return db.getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`).map((row) => row.name);
}

function indexNames(db: ReturnType<typeof createRealSqliteTestDb>): string[] {
  return db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'").map((row) => row.name);
}

function createV5Fixture() {
  const db = createRealSqliteTestDb();
  for (const statement of V5_SCHEMA_STATEMENTS) db.execSync(statement);
  db.execSync('PRAGMA user_version = 5');
  db.runSync(
    'INSERT INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,remote_json,status,error_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    'job-1', 'h3', '1.0.0', 'hash-1', 'autodl', '1.0.0', '{}',
    '{"providerJobId":"remote-1"}', 'RUNNING', '{"code":"OLD"}', 1, 2,
  );
  db.runSync(
    'INSERT INTO tasks (id,prompt,status,resolution,duration,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    'task-1', 'keep me', 'RUNNING', '768p', 5, 1, 2,
  );
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)',
    'h3', '1.0.0', 'hash-1', 'builtin', 'builtin', '{}', 1,
  );
  return db;
}

function createVersionedFixture(version: 4 | 5) {
  const db = createV5Fixture();
  db.execSync(`PRAGMA user_version = ${version}`);
  return db;
}

test('initializes a truly empty v0 directly at v6 without backup', () => {
  const db = createRealSqliteTestDb();
  const backup = jest.fn();
  try {
    expect(runAppMigrations(db as never, { backup, now: () => 10 })).toEqual({
      mode: 'writable', fromVersion: 0, toVersion: 6, migrated: true,
    });
    expect(backup).not.toHaveBeenCalled();
    expect(userVersion(db)).toBe(APP_SCHEMA_VERSION);
    expect(tableNames(db)).toEqual(expect.arrayContaining([
      'workflow_operations', 'workflow_job_events', 'artifact_blobs', 'artifact_blob_refs',
    ]));
    expect(columnNames(db, 'workflow_jobs')).toEqual(expect.arrayContaining([
      'revision', 'provider_handle_json', 'last_error_json', 'next_sync_at',
    ]));
  } finally {
    db.close();
  }
});

test('does not stamp a legacy v0 database', () => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync('CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL)');
    expect(runAppMigrations(db as never, { backup: jest.fn(), now: () => 10 })).toEqual({
      mode: 'legacy', fromVersion: 0,
    });
    expect(userVersion(db)).toBe(0);
    expect(tableNames(db)).not.toContain('workflow_operations');
  } finally {
    db.close();
  }
});

test.each([4, 5] as const)('migrates v%s to v6 with columns, indexes, backfill, and preserved rows', (fromVersion) => {
  const db = createVersionedFixture(fromVersion);
  const backup = jest.fn();
  try {
    expect(runAppMigrations(db as never, { backup, now: () => 10 })).toEqual({
      mode: 'writable', fromVersion, toVersion: 6, migrated: true,
    });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(columnNames(db, 'workflow_jobs')).toEqual(expect.arrayContaining([
      'revision', 'provider_handle_json', 'last_error_json', 'next_sync_at',
    ]));
    expect(db.getFirstSync<{ id: string }>("SELECT id FROM tasks WHERE id='task-1'")).toEqual({ id: 'task-1' });
    expect(db.getFirstSync<{ workflow_id: string }>("SELECT workflow_id FROM workflow_registry WHERE workflow_id='h3'")).toEqual({ workflow_id: 'h3' });
    expect(db.getFirstSync<{ id: string }>("SELECT id FROM workflow_jobs WHERE id='job-1'")).toEqual({ id: 'job-1' });
    expect(db.getFirstSync<{ provider_handle_json: string; last_error_json: string }>(
      "SELECT provider_handle_json,last_error_json FROM workflow_jobs WHERE id='job-1'",
    )).toEqual({
      provider_handle_json: '{"providerJobId":"remote-1"}',
      last_error_json: '{"code":"OLD"}',
    });
    expect(indexNames(db)).toEqual(expect.arrayContaining([
      'idx_workflow_operations_due',
      'idx_workflow_job_events_job_sequence',
      'idx_artifact_blob_refs_owner',
    ]));
  } finally {
    db.close();
  }
});

test('runs the v4 to v5 step before the v5 to v6 step', () => {
  const db = createVersionedFixture(4);
  const executed: string[] = [];
  const execSync = db.execSync.bind(db);
  jest.spyOn(db, 'execSync').mockImplementation((sql: string) => {
    executed.push(sql);
    return execSync(sql);
  });
  try {
    runAppMigrations(db as never, { backup: jest.fn(), now: () => 10 });
    expect(executed.findIndex((sql) => sql.includes('idx_workflow_jobs_status_updated_id')))
      .toBeLessThan(executed.findIndex((sql) => sql.includes('workflow_operations')));
  } finally {
    db.close();
  }
});

test('is idempotent when invoked again at v6', () => {
  const db = createRealSqliteTestDb();
  const backup = jest.fn();
  try {
    runAppMigrations(db as never, { backup, now: () => 10 });
    backup.mockClear();
    expect(runAppMigrations(db as never, { backup, now: () => 11 })).toEqual({
      mode: 'writable', fromVersion: 6, toVersion: 6, migrated: false,
    });
    expect(backup).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test.each([1, 2, 3])('leaves pre-v4 schema v%s in legacy mode', (fromVersion) => {
  const db = createRealSqliteTestDb();
  try {
    db.execSync(`PRAGMA user_version = ${fromVersion}`);
    expect(runAppMigrations(db as never, { backup: jest.fn() })).toEqual({ mode: 'legacy', fromVersion });
    expect(userVersion(db)).toBe(fromVersion);
  } finally {
    db.close();
  }
});

test('opens a future schema readonly without mutating it', () => {
  const db = createRealSqliteTestDb();
  const backup = jest.fn();
  try {
    db.execSync('PRAGMA user_version = 7');
    expect(runAppMigrations(db as never, { backup })).toEqual({ mode: 'future', fromVersion: 7 });
    expect(userVersion(db)).toBe(7);
    expect(backup).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test('records backup failure before migration starts', () => {
  const db = createV5Fixture();
  try {
    expect(() => runAppMigrations(db as never, {
      backup: () => { throw new Error('private path and token must not escape'); },
      now: () => 41,
    })).toThrow('BACKUP_5_TO_6_FAILED');
    expect(userVersion(db)).toBe(5);
    expect(tableNames(db)).not.toContain('workflow_operations');
    expect(getRecoveryState(db as never)).toEqual({
      readonly: true,
      diagnostic: 'BACKUP_5_TO_6_FAILED',
      createdAt: 41,
    });
  } finally {
    db.close();
  }
});

test('rolls back v6 DDL and records a redacted recovery marker', () => {
  const db = createV5Fixture();
  const execSync = db.execSync.bind(db);
  jest.spyOn(db, 'execSync').mockImplementation((sql: string) => {
    if (sql.includes('artifact_blobs')) throw new Error('Authorization: Bearer secret');
    return execSync(sql);
  });
  expect(() => runAppMigrations(db as never, { backup: jest.fn(), now: () => 99 })).toThrow('MIGRATION_5_TO_6_FAILED');
  expect(userVersion(db)).toBe(5);
  expect(tableNames(db)).not.toContain('workflow_operations');
  expect(getRecoveryState(db as never)).toEqual({
    readonly: true,
    diagnostic: 'MIGRATION_5_TO_6_FAILED',
    createdAt: 99,
  });
  db.close();
});

test('a failed fresh v0 remains readonly on the next cold start', () => {
  const db = createRealSqliteTestDb();
  const execSync = db.execSync.bind(db);
  jest.spyOn(db, 'execSync').mockImplementationOnce((sql: string) => execSync(sql));
  jest.spyOn(db, 'execSync').mockImplementation((sql: string) => {
    if (sql.includes('artifact_blobs')) throw new Error('secret migration detail');
    return execSync(sql);
  });
  try {
    expect(() => runAppMigrations(db as never, { now: () => 52 })).toThrow('MIGRATION_0_TO_6_FAILED');
    expect(userVersion(db)).toBe(0);
    expect(() => runAppMigrations(db as never, { now: () => 53 })).toThrow(
      new AppMigrationError('MIGRATION_0_TO_6_FAILED', 0),
    );
    expect(getRecoveryState(db as never)?.createdAt).toBe(52);
  } finally {
    db.close();
  }
});

test('a recovery-only v0 reopens readonly instead of as legacy', () => {
  const db = createRealSqliteTestDb();
  try {
    markRecovery(db as never, 'MIGRATION_0_TO_6_FAILED', 61);
    expect(() => runAppMigrations(db as never)).toThrow('MIGRATION_0_TO_6_FAILED');
    expect(userVersion(db)).toBe(0);
  } finally {
    db.close();
  }
});
