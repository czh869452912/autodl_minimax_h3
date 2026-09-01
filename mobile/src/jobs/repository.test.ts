import { createJobRepository } from './repository';
import type { JobRecord } from './types';

const job: JobRecord = {
  id: 'local-1', workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
  adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x' }, status: 'QUEUED', createdAt: 1, updatedAt: 2,
};

test('round-trips generic job provenance and artifacts', async () => {
  const store = createJobRepository(undefined);
  await store.upsert(job);
  await store.replaceArtifacts('local-1', [{ id: 'a1', jobId: 'local-1', kind: 'image', uri: 'https://example.test/a.png', mime: 'image/png' }]);
  expect(await store.get('local-1')).toMatchObject({ workflowId: 'demo', workflowContentHash: 'hash', inputSnapshot: { prompt: 'x' } });
  expect(await store.listArtifacts('local-1')).toMatchObject([{ kind: 'image', uri: 'https://example.test/a.png' }]);
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

test('uses async transaction for artifact replacement when available', async () => {
  const db = {
    execSync: jest.fn(),
    runAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };
  const store = createJobRepository(db as never);
  await store.replaceArtifacts('local-1', [{ id: 'a', jobId: 'local-1', kind: 'video', uri: 'https://cdn/video' }]);
  expect(db.withTransactionAsync).toHaveBeenCalled();
  expect(db.runAsync).toHaveBeenCalled();
});
