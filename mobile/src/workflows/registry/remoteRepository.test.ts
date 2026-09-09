import { createWorkflowRegistry } from './repository';
import type { RegistryRecord } from './types';
import { WORKFLOW_PACKAGE_IDENTITY_V1 } from './identity';
test('reinstalling active coordinate preserves rollback target', async () => {
  const registry = createWorkflowRegistry(undefined);
  const record: RegistryRecord = { workflowId: 'x', version: '1.0.0', contentHash: 'a', hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1, source: 'remote', trust: 'trusted', definitionJson: '{}', installedAt: 1 };
  await registry.installAndActivate!(record);
  const next = { ...record, version: '1.0.1', contentHash: 'b' };
  await registry.installAndActivate!(next);
  await registry.installAndActivate!(next);
  expect((await registry.getActivePointer!('x'))!.previousVersion).toBe('1.0.0');
});
import { createRealSqliteTestDb } from '../../test/realSqlite';
import { runAppMigrations } from '../../storage/migrations/runner';
test('SQLite reinstall preserves rollback pointer across repository recreation', async () => {
  const db = createRealSqliteTestDb(); runAppMigrations(db as never);
  try {
    const registry = createWorkflowRegistry(db as never);
    const record: RegistryRecord = { workflowId:'x',version:'1.0.0',contentHash:'a',hashScheme:WORKFLOW_PACKAGE_IDENTITY_V1,source:'remote',trust:'trusted',definitionJson:'{}',installedAt:1 };
    await registry.installAndActivate!(record);
    const next = {...record,version:'1.0.1',contentHash:'b'};
    await registry.installAndActivate!(next);
    await createWorkflowRegistry(db as never).installAndActivate!(next);
    expect((await registry.getActivePointer!('x'))!.previousVersion).toBe('1.0.0');
    await registry.rollback('x'); expect((await registry.getActive('x'))!.version).toBe('1.0.0');
  } finally { db.close(); }
});
