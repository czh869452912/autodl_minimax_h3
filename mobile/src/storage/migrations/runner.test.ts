import { createRealSqliteTestDb } from '../../test/realSqlite';
import { APP_SCHEMA_VERSION, V5_SCHEMA_STATEMENTS } from '../schema';
import { AppMigrationError, getRecoveryState, markRecovery } from '../recovery';
import { runAppMigrations } from './runner';
import { v6DurableExecutor } from './v6DurableExecutor';
import { v7RegistryRelease } from './v7RegistryRelease';
import h3V100 from '../../workflows/definitions/autodl/minimax-h3-i2v-15s.json';
import h3V101 from '../../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import { canonicalizeDefinition } from '../../workflows/registry/canonicalize';
import {
  LEGACY_DEFINITION_IDENTITY_V1,
  WORKFLOW_PACKAGE_IDENTITY_V1,
} from '../../workflows/registry/identity';
import { legacyDefinitionToPackage } from '../../workflows/schema/package';
import type { WorkflowDefinition } from '../../workflows/schema/types';

const H3_V100_LEGACY_HASH = '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390';
const H3_V101_PACKAGE_HASH = 'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897';

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

function createHistoricalV7Fixture() {
  const db = createHistoricalV6Fixture();
  v7RegistryRelease.apply(migrationContext(db));
  db.execSync('PRAGMA user_version = 7');
  return db;
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
    h3V100.id, h3V100.version, H3_V100_LEGACY_HASH, 'builtin', 'builtin', canonicalizeDefinition(h3V100), 1,
  );
  return db;
}

function migrationContext(db: ReturnType<typeof createRealSqliteTestDb>) {
  return {
    db: db as never,
    exec: (sql: string) => db.execSync(sql),
    hasColumn: (table: string, column: string) => db.getAllSync<{ name: string }>(`PRAGMA table_info("${table}")`)
      .some((row) => row.name === column),
  };
}

function createHistoricalV6Fixture() {
  const db = createRealSqliteTestDb();
  for (const statement of V5_SCHEMA_STATEMENTS) db.execSync(statement);
  v6DurableExecutor.apply(migrationContext(db));
  db.execSync('PRAGMA user_version = 6');
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)',
    h3V100.id, h3V100.version, H3_V100_LEGACY_HASH,
    'builtin', 'builtin', canonicalizeDefinition(h3V100), 1,
  );
  db.runSync(
    'INSERT INTO workflow_registry_active (workflow_id,version,content_hash,previous_version,previous_hash) VALUES (?,?,?,?,?)',
    h3V100.id, h3V100.version, H3_V100_LEGACY_HASH, h3V100.version, H3_V100_LEGACY_HASH,
  );
  db.runSync(
    'INSERT INTO tasks (id,prompt,status,resolution,duration,created_at,updated_at,workflow_id,workflow_version,workflow_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    'task-old', 'keep me', 'SUCCEEDED', '768p竖', 5, 1, 1,
    h3V100.id, h3V100.version, H3_V100_LEGACY_HASH,
  );
  db.runSync(
    'INSERT INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    'job-old', h3V100.id, h3V100.version, H3_V100_LEGACY_HASH,
    'autodl-comfyui', '0.0.0', '{}', 'SUCCEEDED', 1, 1,
  );
  db.runSync(
    'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
    'artifact-old', 'job-old', 'video', 'file:///kept.mp4', 'video/mp4', '{"provenance":"kept"}',
  );
  return db;
}

test('migrates historical workflow identities through v8 without rewriting provenance', () => {
  const db = createHistoricalV6Fixture();
  const beforeRegistry = db.getFirstSync<any>('SELECT * FROM workflow_registry WHERE version = ?', h3V100.version);
  const beforeActive = db.getFirstSync<any>('SELECT * FROM workflow_registry_active WHERE workflow_id = ?', h3V100.id);
  const beforeTask = db.getFirstSync<any>("SELECT * FROM tasks WHERE id='task-old'");
  const beforeJob = db.getFirstSync<any>("SELECT * FROM workflow_jobs WHERE id='job-old'");
  const beforeArtifact = db.getFirstSync<any>("SELECT * FROM workflow_artifacts WHERE id='artifact-old'");
  const backup = jest.fn();
  try {
    expect(runAppMigrations(db as never, { backup, now: () => 10 })).toEqual({
      mode: 'writable', fromVersion: 6, toVersion: 8, migrated: true,
    });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(db.getFirstSync<any>('SELECT * FROM workflow_registry WHERE version = ?', h3V100.version))
      .toEqual({ ...beforeRegistry, hash_scheme: LEGACY_DEFINITION_IDENTITY_V1 });
    expect(db.getFirstSync<any>('SELECT * FROM workflow_registry_active WHERE workflow_id = ?', h3V100.id)).toEqual(beforeActive);
    expect(db.getFirstSync<any>("SELECT * FROM tasks WHERE id='task-old'")).toEqual(beforeTask);
    expect(db.getFirstSync<any>("SELECT * FROM workflow_jobs WHERE id='job-old'")).toEqual(beforeJob);
    expect(db.getFirstSync<any>("SELECT * FROM workflow_artifacts WHERE id='artifact-old'")).toEqual(beforeArtifact);
    expect(tableNames(db)).toContain('workflow_registry_releases');
  } finally {
    db.close();
  }
});

test('backfills package identities and is idempotent at v8', () => {
  const db = createHistoricalV6Fixture();
  const pkg = legacyDefinitionToPackage(h3V101 as WorkflowDefinition);
  db.runSync(
    'INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)',
    h3V101.id, h3V101.version, H3_V101_PACKAGE_HASH,
    'builtin', 'builtin', canonicalizeDefinition(JSON.parse(JSON.stringify(pkg))), 2,
  );
  const backup = jest.fn();
  try {
    runAppMigrations(db as never, { backup, now: () => 10 });
    expect(db.getFirstSync<{ hash_scheme: string }>('SELECT hash_scheme FROM workflow_registry WHERE version = ?', h3V101.version))
      .toEqual({ hash_scheme: WORKFLOW_PACKAGE_IDENTITY_V1 });
    backup.mockClear();
    expect(runAppMigrations(db as never, { backup, now: () => 11 })).toEqual({
      mode: 'writable', fromVersion: 8, toVersion: 8, migrated: false,
    });
    expect(backup).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test('upgrades v7 projections, wake state, and expired claims without rewriting representative rows', () => {
  const db = createHistoricalV7Fixture();
  db.runSync(
    'INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,lease_owner,lease_expires_at,last_error_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    'operation-old', 'SYNC', 'job-old', 'sync:job-old', '{"keep":true}', 'RUNNING', 2, 3, 'worker-old', 4, '{"reason":"keep"}', 1, 2,
  );
  db.runSync(
    'INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?)',
    'a'.repeat(64), 42, 'video/mp4', 'blobs/old.mp4', 1, 2,
  );
  db.runSync(
    'INSERT INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)',
    'a'.repeat(64), 'workflow_artifact', 'artifact-old', 3,
  );
  db.runSync(
    'INSERT INTO media_assets (id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    'asset-old', 'task-old', 'Kept asset', 'keep this', 'file:///kept.mp4', 'video/mp4', 'READY', 1, 2,
  );
  db.runSync(
    'INSERT INTO media_deliveries (id,asset_id,target,uri,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    'delivery-old', 'asset-old', 'gallery', 'content://kept', 'DELIVERED', 1, 2,
  );
  const preserved = {
    job: db.getFirstSync<any>("SELECT * FROM workflow_jobs WHERE id='job-old'"),
    task: db.getFirstSync<any>("SELECT * FROM tasks WHERE id='task-old'"),
    operation: db.getFirstSync<any>("SELECT * FROM workflow_operations WHERE id='operation-old'"),
    artifact: db.getFirstSync<any>("SELECT * FROM workflow_artifacts WHERE id='artifact-old'"),
    blob: db.getFirstSync<any>("SELECT * FROM artifact_blobs WHERE sha256 = ?", 'a'.repeat(64)),
    blobRef: db.getFirstSync<any>("SELECT * FROM artifact_blob_refs WHERE owner_id='artifact-old'"),
    asset: db.getFirstSync<any>("SELECT * FROM media_assets WHERE id='asset-old'"),
    delivery: db.getFirstSync<any>("SELECT * FROM media_deliveries WHERE id='delivery-old'"),
  };
  try {
    expect(runAppMigrations(db as never, { backup: jest.fn(), now: () => 10 })).toEqual({
      mode: 'writable', fromVersion: 7, toVersion: 8, migrated: true,
    });
    expect(userVersion(db)).toBe(8);
    expect(db.getFirstSync('SELECT * FROM workflow_jobs WHERE id = ?', 'job-old')).toEqual(preserved.job);
    expect(db.getFirstSync('SELECT * FROM tasks WHERE id = ?', 'task-old')).toEqual(preserved.task);
    expect(db.getFirstSync('SELECT * FROM workflow_operations WHERE id = ?', 'operation-old')).toEqual(preserved.operation);
    expect(db.getFirstSync('SELECT * FROM workflow_artifacts WHERE id = ?', 'artifact-old')).toEqual(preserved.artifact);
    expect(db.getFirstSync('SELECT * FROM artifact_blobs WHERE sha256 = ?', 'a'.repeat(64))).toEqual(preserved.blob);
    expect(db.getFirstSync("SELECT * FROM artifact_blob_refs WHERE owner_id='artifact-old'")).toEqual(preserved.blobRef);
    expect(db.getFirstSync("SELECT * FROM media_assets WHERE id='asset-old'")).toEqual(preserved.asset);
    expect(db.getFirstSync("SELECT * FROM media_deliveries WHERE id='delivery-old'")).toEqual(preserved.delivery);
    expect(db.getFirstSync('SELECT * FROM task_projection_state')).toEqual({ singleton: 1, revision: 0 });
    expect(db.getFirstSync('SELECT * FROM executor_wake_state')).toEqual({
      singleton: 1, generation: 0, handled_generation: 0, maintenance_generation: 0, requested_at: 0,
    });
    db.runSync(
      'INSERT INTO tasks (id,prompt,status,resolution,duration,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      'task-new', 'new task', 'QUEUED', '768p', 5, 3, 3,
    );
    expect(db.getFirstSync('SELECT revision FROM task_projection_state')).toEqual({ revision: 1 });
    db.runSync("UPDATE tasks SET status = 'RUNNING' WHERE id = 'task-new'");
    expect(db.getFirstSync('SELECT revision FROM task_projection_state')).toEqual({ revision: 2 });
    db.runSync("DELETE FROM tasks WHERE id = 'task-new'");
    expect(db.getFirstSync('SELECT revision FROM task_projection_state')).toEqual({ revision: 3 });
    db.runSync(
      "INSERT INTO workflow_operations (id,kind,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES ('operation-new','STATUS_SYNC','status:task-new','{}','PENDING',0,5,3,3)",
    );
    expect(db.getFirstSync('SELECT revision FROM task_projection_state')).toEqual({ revision: 4 });
    db.runSync("UPDATE workflow_operations SET state = 'CLAIMED' WHERE id = 'operation-new'");
    expect(db.getFirstSync('SELECT revision FROM task_projection_state')).toEqual({ revision: 5 });
    db.runSync("DELETE FROM workflow_operations WHERE id = 'operation-new'");
    expect(db.getFirstSync('SELECT revision FROM task_projection_state')).toEqual({ revision: 6 });
    const plan = db.getAllSync<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT id FROM workflow_operations WHERE state = 'RUNNING' AND lease_expires_at < 5 ORDER BY lease_expires_at, id",
    );
    expect(plan.map((row) => row.detail).join('\n')).toContain('idx_workflow_operations_expired_claim');
  } finally {
    db.close();
  }
});

test.each([
  ['unknown representation', '{}', H3_V100_LEGACY_HASH],
  ['bad stored digest', canonicalizeDefinition(h3V100), '0'.repeat(64)],
])('rejects %s before stamping schema v8', (_name, definitionJson, contentHash) => {
  const db = createHistoricalV6Fixture();
  db.runSync(
    'UPDATE workflow_registry SET definition_json = ?, content_hash = ? WHERE workflow_id = ? AND version = ?',
    definitionJson, contentHash, h3V100.id, h3V100.version,
  );
  try {
    expect(() => runAppMigrations(db as never, { backup: jest.fn(), now: () => 12 }))
      .toThrow('MIGRATION_6_TO_8_FAILED');
    expect(userVersion(db)).toBe(6);
    expect(columnNames(db, 'workflow_registry')).not.toContain('hash_scheme');
    expect(tableNames(db)).not.toContain('workflow_registry_releases');
  } finally {
    db.close();
  }
});

function createVersionedFixture(version: 4 | 5) {
  const db = createV5Fixture();
  db.execSync(`PRAGMA user_version = ${version}`);
  return db;
}

test('initializes a truly empty v0 directly at v8 without backup', () => {
  const db = createRealSqliteTestDb();
  const backup = jest.fn();
  try {
    expect(runAppMigrations(db as never, { backup, now: () => 10 })).toEqual({
      mode: 'writable', fromVersion: 0, toVersion: 8, migrated: true,
    });
    expect(backup).not.toHaveBeenCalled();
    expect(userVersion(db)).toBe(APP_SCHEMA_VERSION);
    expect(tableNames(db)).toEqual(expect.arrayContaining([
      'workflow_operations', 'workflow_job_events', 'artifact_blobs', 'artifact_blob_refs',
      'task_projection_state', 'executor_wake_state',
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

test.each([4, 5] as const)('migrates v%s to v8 with columns, indexes, backfill, and preserved rows', (fromVersion) => {
  const db = createVersionedFixture(fromVersion);
  const backup = jest.fn();
  try {
    expect(runAppMigrations(db as never, { backup, now: () => 10 })).toEqual({
      mode: 'writable', fromVersion, toVersion: 8, migrated: true,
    });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(columnNames(db, 'workflow_jobs')).toEqual(expect.arrayContaining([
      'revision', 'provider_handle_json', 'last_error_json', 'next_sync_at',
    ]));
    expect(db.getFirstSync<{ id: string }>("SELECT id FROM tasks WHERE id='task-1'")).toEqual({ id: 'task-1' });
    expect(db.getFirstSync<{ workflow_id: string }>('SELECT workflow_id FROM workflow_registry WHERE workflow_id = ?', h3V100.id))
      .toEqual({ workflow_id: h3V100.id });
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
      'idx_workflow_operations_expired_claim',
    ]));
  } finally {
    db.close();
  }
});

test('runs the v4 to v5 step before the v5 to v6 and v6 to v7 steps', () => {
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
    expect(executed.findIndex((sql) => sql.includes('workflow_operations')))
      .toBeLessThan(executed.findIndex((sql) => sql.includes('workflow_registry_releases')));
  } finally {
    db.close();
  }
});

test('is idempotent when invoked again at v8', () => {
  const db = createRealSqliteTestDb();
  const backup = jest.fn();
  try {
    runAppMigrations(db as never, { backup, now: () => 10 });
    backup.mockClear();
    expect(runAppMigrations(db as never, { backup, now: () => 11 })).toEqual({
      mode: 'writable', fromVersion: 8, toVersion: 8, migrated: false,
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
    db.execSync('PRAGMA user_version = 9');
    expect(runAppMigrations(db as never, { backup })).toEqual({ mode: 'future', fromVersion: 9 });
    expect(userVersion(db)).toBe(9);
    expect(backup).not.toHaveBeenCalled();
  } finally {
    db.close();
  }
});

test('records v7 backup failure without applying the v8 projection migration', () => {
  const db = createHistoricalV7Fixture();
  try {
    expect(() => runAppMigrations(db as never, {
      backup: () => { throw new Error('private backup path must not escape'); },
      now: () => 71,
    })).toThrow('BACKUP_7_TO_8_FAILED');
    expect(userVersion(db)).toBe(7);
    expect(tableNames(db)).not.toContain('task_projection_state');
    expect(tableNames(db)).not.toContain('executor_wake_state');
    expect(getRecoveryState(db as never)).toEqual({
      readonly: true,
      diagnostic: 'BACKUP_7_TO_8_FAILED',
      createdAt: 71,
    });
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
    })).toThrow('BACKUP_5_TO_8_FAILED');
    expect(userVersion(db)).toBe(5);
    expect(tableNames(db)).not.toContain('workflow_operations');
    expect(getRecoveryState(db as never)).toEqual({
      readonly: true,
      diagnostic: 'BACKUP_5_TO_8_FAILED',
      createdAt: 41,
    });
  } finally {
    db.close();
  }
});

test('rolls back migration DDL and records a redacted recovery marker', () => {
  const db = createV5Fixture();
  const execSync = db.execSync.bind(db);
  jest.spyOn(db, 'execSync').mockImplementation((sql: string) => {
    if (sql.includes('artifact_blobs')) throw new Error('Authorization: Bearer secret');
    return execSync(sql);
  });
  expect(() => runAppMigrations(db as never, { backup: jest.fn(), now: () => 99 })).toThrow('MIGRATION_5_TO_8_FAILED');
  expect(userVersion(db)).toBe(5);
  expect(tableNames(db)).not.toContain('workflow_operations');
  expect(getRecoveryState(db as never)).toEqual({
    readonly: true,
    diagnostic: 'MIGRATION_5_TO_8_FAILED',
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
    expect(() => runAppMigrations(db as never, { now: () => 52 })).toThrow('MIGRATION_0_TO_8_FAILED');
    expect(userVersion(db)).toBe(0);
    expect(() => runAppMigrations(db as never, { now: () => 53 })).toThrow(
      new AppMigrationError('MIGRATION_0_TO_8_FAILED', 0),
    );
    expect(getRecoveryState(db as never)?.createdAt).toBe(52);
  } finally {
    db.close();
  }
});

test('a recovery-only v0 reopens readonly instead of as legacy', () => {
  const db = createRealSqliteTestDb();
  try {
    markRecovery(db as never, 'MIGRATION_0_TO_8_FAILED', 61);
    expect(() => runAppMigrations(db as never)).toThrow('MIGRATION_0_TO_8_FAILED');
    expect(userVersion(db)).toBe(0);
  } finally {
    db.close();
  }
});
