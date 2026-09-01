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
