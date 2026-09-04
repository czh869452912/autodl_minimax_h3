import { createJobRepository } from './repository';
import type { JobRecord } from './types';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';

const job: JobRecord = {
  id: 'local-1', revision: 0, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
  adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x' }, status: 'QUEUED', createdAt: 1, updatedAt: 2,
};

test('round-trips generic job provenance and artifacts', async () => {
  const store = createJobRepository(undefined);
  await store.upsert(job);
  await store.replaceArtifacts('local-1', [{ id: 'a1', jobId: 'local-1', kind: 'image', uri: 'https://example.test/a.png', mime: 'image/png' }]);
  expect(await store.get('local-1')).toMatchObject({ workflowId: 'demo', workflowContentHash: 'hash', inputSnapshot: { prompt: 'x' } });
  expect(await store.listArtifacts('local-1')).toMatchObject([{ kind: 'image', uri: 'https://example.test/a.png' }]);
});

test('lists only the requested most recent jobs in memory and SQLite', async () => {
  const memory = createJobRepository(undefined);
  for (let index = 1; index <= 5; index += 1) await memory.upsert({ ...job, id: `memory-${index}`, createdAt: index, updatedAt: index });
  expect((await memory.listRecent(2)).map((item) => item.id)).toEqual(['memory-5', 'memory-4']);

  const db = createInitializedRealSqliteTestDb();
  try {
    const sqlite = createJobRepository(db as never);
    for (let index = 1; index <= 5; index += 1) await sqlite.upsert({ ...job, id: `sqlite-${index}`, createdAt: index, updatedAt: index });
    expect((await sqlite.listRecent(2)).map((item) => item.id)).toEqual(['sqlite-5', 'sqlite-4']);
    expect(await sqlite.listRecent(0)).toEqual([]);
  } finally { db.close(); }
});

test('round-trips revision, opaque provider handle, durable error, and next sync time', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const store = createJobRepository(db as never);
    await store.upsert({
      ...job,
      revision: 3,
      providerHandle: { providerJobId: 'remote-1', region: 'opaque-region' },
      lastError: { code: 'HTTP_503', message: 'retry later', retryable: true },
      nextSyncAt: 900,
    });
    expect(await store.get(job.id)).toMatchObject({
      revision: 3,
      providerHandle: { providerJobId: 'remote-1', region: 'opaque-region' },
      remote: { providerJobId: 'remote-1', region: 'opaque-region' },
      lastError: { code: 'HTTP_503' },
      error: { code: 'HTTP_503' },
      nextSyncAt: 900,
    });
  } finally { db.close(); }
});

test('ignores malformed persisted job JSON instead of crashing', async () => {
  const db = {
    execSync: jest.fn(),
    getFirstSync: jest.fn((sql: string) => sql.includes('PRAGMA') ? { user_version: 3 } : { id: 'bad', workflow_id: 'w', workflow_version: '1', workflow_hash: 'h', adapter_id: 'a', adapter_version: '1', input_json: '{', remote_json: '{', status: 'SUCCEEDED', error_json: '{', created_at: 1, updated_at: 2 }),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
  };
  const store = createJobRepository(db as never);
  await expect(store.get('bad')).resolves.toMatchObject({ inputSnapshot: {}, remote: undefined, error: undefined });
});

test('binds SQLite transaction methods to the database instance', async () => {
  const db = {
    execSync: jest.fn(),
    getFirstSync: jest.fn((sql: string) => sql.includes('PRAGMA') ? { user_version: 4 } : null),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
    withTransactionSync(this: unknown, callback: () => void) {
      if (!this || this !== db) throw new TypeError('database context missing');
      callback();
    },
  };
  const store = createJobRepository(db as never);
  await expect(store.replaceArtifacts('job-1', [])).resolves.toBeUndefined();
});

test('prefers async SQLite operations when available', async () => {
  const db = {
    execSync: jest.fn(),
    runSync: jest.fn(() => { throw new Error('sync path used'); }),
    getFirstSync: jest.fn(() => { throw new Error('sync path used'); }),
    getAllSync: jest.fn(() => { throw new Error('sync path used'); }),
    runAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
  };
  const store = createJobRepository(db as never);
  await store.upsert(job);
  await store.get('local-1');
  await store.list();
  expect(db.runAsync).toHaveBeenCalled();
  expect(db.getFirstAsync).toHaveBeenCalled();
  expect(db.getAllAsync).toHaveBeenCalled();
});

test('uses the exclusive transaction connection for artifact replacement', async () => {
  const transaction = { runAsync: jest.fn(async () => undefined) };
  const db = {
    execSync: jest.fn(),
    runAsync: jest.fn(async () => { throw new Error('shared connection used inside transaction'); }),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    withTransactionAsync: jest.fn(async () => { throw new Error('non-exclusive transaction used'); }),
    withExclusiveTransactionAsync: jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
  };
  const store = createJobRepository(db as never);
  await store.replaceArtifacts('local-1', [{ id: 'a', jobId: 'local-1', kind: 'video', uri: 'https://cdn/video' }]);
  expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  expect(db.withTransactionAsync).not.toHaveBeenCalled();
  expect(transaction.runAsync).toHaveBeenNthCalledWith(1, 'DELETE FROM workflow_artifacts WHERE job_id = ?', 'local-1');
  expect(transaction.runAsync).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO workflow_artifacts'), 'a', 'local-1', 'video', 'https://cdn/video', null, null);
});

test('keeps overlapping artifact replacements on their own exclusive connections', async () => {
  const transactions: Array<{ runAsync: jest.Mock }> = [];
  const db = {
    execSync: jest.fn(),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    withExclusiveTransactionAsync: jest.fn(async (callback: (tx: { runAsync: jest.Mock }) => Promise<void>) => {
      const tx = { runAsync: jest.fn(async () => undefined) };
      transactions.push(tx);
      await Promise.resolve();
      await callback(tx);
    }),
  };
  const store = createJobRepository(db as never);

  await Promise.all([
    store.replaceArtifacts('job-1', [{ id: 'a', jobId: 'job-1', kind: 'video', uri: 'https://cdn/a' }]),
    store.replaceArtifacts('job-2', [{ id: 'b', jobId: 'job-2', kind: 'video', uri: 'https://cdn/b' }]),
  ]);

  expect(transactions).toHaveLength(2);
  expect(transactions[0].runAsync.mock.calls.flat()).toContain('job-1');
  expect(transactions[0].runAsync.mock.calls.flat()).not.toContain('job-2');
  expect(transactions[1].runAsync.mock.calls.flat()).toContain('job-2');
  expect(transactions[1].runAsync.mock.calls.flat()).not.toContain('job-1');
});
