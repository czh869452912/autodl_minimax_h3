import { createWorkflowRegistry } from './repository';
import type { RegistryRecord } from './types';

function record(version: string, hash: string): RegistryRecord {
  return { workflowId: 'demo', version, contentHash: hash, source: 'remote', trust: 'trusted', definitionJson: '{}', installedAt: 1 };
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
