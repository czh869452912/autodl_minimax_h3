import h3V101Package from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json';
import { canonicalizeDefinition } from './canonicalize';
import { createWorkflowCatalog, registryRecordToDefinition } from './catalog';
import { builtinWorkflowReleases } from './builtin';
import { WORKFLOW_PACKAGE_IDENTITY_V1 } from './identity';
import { RegistryReleaseError } from './releaseManifest';
import { createWorkflowRegistry } from './repository';
import type { RegistryRecord } from './types';

const activeRecord: RegistryRecord = {
  workflowId: 'autodl.minimax-h3.i2v-15s',
  version: '1.0.1',
  contentHash: 'fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897',
  hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1,
  source: 'builtin',
  trust: 'builtin',
  definitionJson: canonicalizeDefinition(h3V101Package),
  installedAt: 1,
};

test('delegates builtin releases once and lists the reconciled active workflow', async () => {
  const registry = createWorkflowRegistry(undefined);
  await registry.upsert(activeRecord);
  await registry.setActive(activeRecord.workflowId, activeRecord.version, activeRecord.contentHash);
  const coordinator = { reconcile: jest.fn(async () => ({ status: 'unchanged' as const })) };
  const catalog = createWorkflowCatalog({ registry, coordinator, releaseSet: builtinWorkflowReleases });

  await expect(catalog.bootstrap()).resolves.toEqual({ status: 'unchanged' });
  expect(coordinator.reconcile).toHaveBeenCalledTimes(1);
  expect(coordinator.reconcile).toHaveBeenCalledWith(builtinWorkflowReleases);
  expect((await catalog.listActive())[0].version).toBe('1.0.1');
  expect((await catalog.getActive(activeRecord.workflowId))?.contentHash).toBe(activeRecord.contentHash);
});

test('rejects a mismatched active pointer instead of silently using the previous record', async () => {
  const registry = createWorkflowRegistry(undefined);
  await registry.upsert(activeRecord);
  await registry.setActive(activeRecord.workflowId, activeRecord.version, activeRecord.contentHash);
  jest.spyOn(registry, 'getActivePointer').mockResolvedValue({
    workflowId: activeRecord.workflowId,
    version: activeRecord.version,
    contentHash: 'tampered-pointer',
  });
  const catalog = createWorkflowCatalog({
    registry,
    coordinator: { reconcile: jest.fn(async () => ({ status: 'unchanged' as const })) },
    releaseSet: builtinWorkflowReleases,
  });

  await expect(catalog.listActive()).rejects.toEqual(
    expect.objectContaining<Partial<RegistryReleaseError>>({ code: 'REGISTRY_ACTIVE_POINTER_INVALID' }),
  );
});

test('retains manual activation and rollback operations', async () => {
  const registry = createWorkflowRegistry(undefined);
  const older = { ...activeRecord, version: '1.0.0', contentHash: 'older-hash' };
  await registry.upsert(older);
  await registry.upsert(activeRecord);
  await registry.setActive(older.workflowId, older.version, older.contentHash);
  const catalog = createWorkflowCatalog({
    registry,
    coordinator: { reconcile: jest.fn(async () => ({ status: 'unchanged' as const })) },
    releaseSet: builtinWorkflowReleases,
  });

  await catalog.activate(activeRecord.workflowId, activeRecord.version);
  expect((await catalog.getActive(activeRecord.workflowId))?.version).toBe('1.0.1');
  await catalog.rollback(activeRecord.workflowId);
  expect((await catalog.getActive(activeRecord.workflowId))?.version).toBe('1.0.0');
});

test('converts package-backed registry records for form consumers', () => {
  expect(registryRecordToDefinition(activeRecord).id).toBe(activeRecord.workflowId);
  expect((registryRecordToDefinition(activeRecord).inputs.properties as Record<string, unknown>)?.prompt)
    .toEqual(expect.objectContaining({ type: 'string' }));
});
