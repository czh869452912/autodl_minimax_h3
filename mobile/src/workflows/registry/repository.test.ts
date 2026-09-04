import { createWorkflowRegistry } from './repository';
import type { RegistryRecord } from './types';
import { createRealSqliteTestDb } from '../../test/realSqlite';
import { runAppMigrations } from '../../storage/migrations/runner';

function record(version: string, hash: string): RegistryRecord {
  return { workflowId: 'demo', version, contentHash: hash, hashScheme: 'workflow-package/without-declared-hash+sorted-json@1', source: 'remote', trust: 'trusted', definitionJson: '{}', installedAt: 1 };
}

test('keeps versions immutable and rolls activation back atomically', async () => {
  const store = createWorkflowRegistry(undefined);
  await store.upsert(record('1.0.0', 'aaa'));
  await store.setActive('demo', '1.0.0', 'aaa');
  await store.upsert(record('2.0.0', 'bbb'));
  await store.setActive('demo', '2.0.0', 'bbb');
  expect(await store.getActive('demo')).toMatchObject({ version: '2.0.0', contentHash: 'bbb' });
  await store.rollback('demo');
  expect(await store.getActive('demo')).toMatchObject({ version: '1.0.0', contentHash: 'aaa' });
  await expect(store.upsert(record('1.0.0', 'changed'))).rejects.toThrow('immutable');
  await expect(store.upsert({
    ...record('1.0.0', 'aaa'),
    hashScheme: 'workflow-definition/sorted-json@1',
  })).rejects.toThrow('immutable');
});

test('removes only unreferenced inactive definitions', async () => {
  const store = createWorkflowRegistry(undefined);
  await store.upsert(record('1.0.0', 'aaa'));
  await store.upsert(record('2.0.0', 'bbb'));
  await store.setActive('demo', '2.0.0', 'bbb');
  await store.removeUnreferenced(new Set(['aaa']));
  expect((await store.list()).map((item) => item.contentHash).sort()).toEqual(['aaa', 'bbb']);
});

test('retains the previous pointer so rollback remains possible after cleanup', async () => {
  const store = createWorkflowRegistry(undefined);
  await store.upsert(record('1.0.0', 'aaa'));
  await store.upsert(record('2.0.0', 'bbb'));
  await store.setActive('demo', '1.0.0', 'aaa');
  await store.setActive('demo', '2.0.0', 'bbb');
  await store.removeUnreferenced(new Set());
  await store.rollback('demo');
  expect(await store.getActive('demo')).toMatchObject({ version: '1.0.0' });
});

test('initializes registry schema without using reserved SQLite keyword commit', () => {
  const db = {
    execSync: jest.fn((sql: string) => {
      if (/\bcommit\s+TEXT\b/i.test(sql)) throw new Error('near "commit": syntax error');
    }),
    getFirstSync: jest.fn((sql: string) => sql.includes('PRAGMA') ? { user_version: 4 } : null),
  };
  expect(() => createWorkflowRegistry(db as never)).not.toThrow();
  expect(db.execSync.mock.calls.flat()).not.toEqual(expect.arrayContaining([expect.stringMatching(/\bcommit\s+TEXT\b/i)]));
});

test('does not execute registry DDL from the repository constructor', () => {
  const db = {
    execSync: jest.fn(),
    getFirstSync: jest.fn(() => ({ user_version: 5 })),
  };
  createWorkflowRegistry(db as never);
  expect(db.execSync).not.toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS workflow_registry'));
});

test('applies records, active pointer, and release ledger in one SQLite batch', async () => {
  const db = createRealSqliteTestDb();
  runAppMigrations(db as never);
  const store = createWorkflowRegistry(db as never);
  try {
    await store.applyBuiltinRelease({
      releaseId: 'release-1',
      manifestHash: 'manifest-1',
      records: [record('1.0.0', 'aaa'), record('2.0.0', 'bbb')],
      activations: [{ workflowId: 'demo', version: '2.0.0', contentHash: 'bbb' }],
      appliedAt: 10,
    });
    await expect(store.getAppliedRelease('release-1')).resolves.toEqual({
      releaseId: 'release-1', manifestHash: 'manifest-1', appliedAt: 10,
    });
    await expect(store.getActivePointer('demo')).resolves.toEqual({
      workflowId: 'demo', version: '2.0.0', contentHash: 'bbb',
    });
    expect((await store.list()).map((item) => item.hashScheme)).toEqual([
      'workflow-package/without-declared-hash+sorted-json@1',
      'workflow-package/without-declared-hash+sorted-json@1',
    ]);
  } finally {
    db.close();
  }
});

test('rolls back inserted records and ledger when activation fails', async () => {
  const db = createRealSqliteTestDb();
  runAppMigrations(db as never);
  const runSync = db.runSync.bind(db);
  jest.spyOn(db, 'runSync').mockImplementation((sql: string, ...params: any[]) => {
    if (sql.startsWith('INSERT OR REPLACE INTO workflow_registry_active')) throw new Error('injected activation failure');
    return runSync(sql, ...params);
  });
  const store = createWorkflowRegistry(db as never);
  try {
    await expect(store.applyBuiltinRelease({
      releaseId: 'release-fail',
      manifestHash: 'manifest-fail',
      records: [record('1.0.0', 'aaa')],
      activations: [{ workflowId: 'demo', version: '1.0.0', contentHash: 'aaa' }],
      appliedAt: 11,
    })).rejects.toMatchObject({ code: 'REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK' });
    expect(db.getAllSync('SELECT * FROM workflow_registry')).toEqual([]);
    expect(db.getAllSync('SELECT * FROM workflow_registry_releases')).toEqual([]);
  } finally {
    db.close();
  }
});

test('marks recovery required when a failed release transaction cannot roll back', async () => {
  const db = {
    getFirstSync: jest.fn(() => null),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn((sql: string) => {
      if (sql.startsWith('INSERT INTO workflow_registry (')) throw new Error('injected write failure');
      return {};
    }),
    execSync: jest.fn((sql: string) => {
      if (sql === 'ROLLBACK') throw new Error('injected rollback failure');
    }),
  };
  const store = createWorkflowRegistry(db as never);

  await expect(store.applyBuiltinRelease({
    releaseId: 'release-rollback-fail',
    manifestHash: 'manifest-rollback-fail',
    records: [record('1.0.0', 'aaa')],
    activations: [],
    appliedAt: 12,
  })).rejects.toMatchObject({ code: 'REGISTRY_RELEASE_RECOVERY_REQUIRED' });
  expect(db.runSync).toHaveBeenCalledWith(
    expect.stringContaining('INSERT OR REPLACE INTO app_database_recovery'),
    'REGISTRY_RELEASE_RECOVERY_REQUIRED',
    12,
  );
});

test('returns the raw active pointer even when normal resolution falls back to previous', async () => {
  const db = createRealSqliteTestDb();
  runAppMigrations(db as never);
  const store = createWorkflowRegistry(db as never);
  try {
    await store.upsert(record('1.0.0', 'aaa'));
    db.runSync(
      'INSERT INTO workflow_registry_active (workflow_id,version,content_hash,previous_version,previous_hash) VALUES (?,?,?,?,?)',
      'demo', 'missing', 'missing-hash', '1.0.0', 'aaa',
    );
    await expect(store.getActivePointer('demo')).resolves.toEqual({
      workflowId: 'demo', version: 'missing', contentHash: 'missing-hash', previousVersion: '1.0.0', previousHash: 'aaa',
    });
    await expect(store.getActive('demo')).resolves.toMatchObject({ version: '1.0.0', contentHash: 'aaa' });
  } finally {
    db.close();
  }
});
