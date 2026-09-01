import { createWorkflowRegistryService } from './service';
import type { RegistryRecord } from './types';

const definition = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', properties: {} }, request: { operation: 'workflow.submit', bindings: {} }, outputs: { artifacts: [] } };
const record = (source: RegistryRecord['source']): RegistryRecord => ({ workflowId: 'demo', version: '1.0.0', contentHash: 'hash', source, trust: source === 'builtin' ? 'builtin' : 'trusted', definitionJson: JSON.stringify(definition), installedAt: 1 });

test('discovers builtin, local, and remote records with builtin precedence', async () => {
  const records = [record('remote'), record('local-import'), record('builtin')];
  const repository = { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => records), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() };
  const service = createWorkflowRegistryService({ repository: repository as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0' });
  expect((await service.discoverWorkflows())[0].source).toBe('builtin');
});

test('preserves active state when remote verification fails', async () => {
  const repository = { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => [record('builtin')]), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() };
  const service = createWorkflowRegistryService({ repository: repository as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0', allowDomains: ['example.test'], fetch: jest.fn(async () => new Response('{"bad":true}', { status: 200 })) });
  await expect(service.syncRemoteIndex('https://registry.example.test/registry/index.json')).rejects.toMatchObject({ code: 'REGISTRY_SIGNATURE_INVALID' });
  expect(repository.setActive).not.toHaveBeenCalled();
});

test('discovers only active versions and activates a builtin during bootstrap', async () => {
  const built = record('builtin');
  const newer = { ...record('remote'), version: '2.0.0', contentHash: 'new' };
  const repository = { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => [built, newer]), setActive: jest.fn(), getActive: jest.fn(async () => newer), rollback: jest.fn(), removeUnreferenced: jest.fn() };
  const service = createWorkflowRegistryService({ repository: repository as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0' });
  expect(await service.discoverWorkflows()).toEqual([newer]);
  await service.activateBuiltin(definition as never);
  expect(repository.setActive).toHaveBeenCalledWith('demo', '1.0.0', expect.any(String));
});

test('rejects incompatible app and adapter versions before installation', async () => {
  const incompatible = { ...definition, compatibility: { minAppVersion: '2.0.0', requiredAdapterVersion: '^9.0.0' } };
  const service = createWorkflowRegistryService({ repository: { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() } as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0', adapterVersions: { demo: '1.0.0' } });
  await expect(service.activateBuiltin(incompatible as never)).rejects.toMatchObject({ code: 'REGISTRY_INCOMPATIBLE' });
});
