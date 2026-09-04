import { createWorkflowRegistryService } from './service';
import type { RegistryRecord } from './types';
import { canonicalizeDefinition } from './canonicalize';
import { sha256Hex } from './crypto';

jest.mock('./trust', () => ({ verifySignedPayload: jest.fn(async () => true) }));

const definition = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', properties: {} }, request: { operation: 'workflow.submit', bindings: {} }, outputs: { artifacts: [] } };
const record = (source: RegistryRecord['source']): RegistryRecord => ({ workflowId: 'demo', version: '1.0.0', contentHash: 'hash', hashScheme: 'workflow-package/without-declared-hash+sorted-json@1', source, trust: source === 'builtin' ? 'builtin' : 'trusted', definitionJson: JSON.stringify(definition), installedAt: 1 });

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

test('rejects a Registry redirect that leaves the configured domain allowlist', async () => {
  const fetch = jest.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/registry/index.json' } }));
  const service = createWorkflowRegistryService({ repository: { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() } as never, adapters: [], appVersion: '1.0.0', allowDomains: ['example.test'], fetch });
  await expect(service.syncRemoteIndex('https://registry.example.test/registry/index.json')).rejects.toMatchObject({ code: 'REGISTRY_DOMAIN_REJECTED' });
});

test('times out while reading a stalled Registry response body', async () => {
  jest.useFakeTimers();
  try {
    const reader = { read: jest.fn(() => new Promise<never>(() => undefined)), cancel: jest.fn(async () => undefined) };
    const fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), body: { getReader: () => reader } })) as unknown as typeof global.fetch;
    const service = createWorkflowRegistryService({ repository: { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() } as never, adapters: [], appVersion: '1.0.0', allowDomains: ['example.test'], fetch, fetchTimeoutMs: 10 });
    const pending = service.syncRemoteIndex('https://registry.example.test/registry/index.json');
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    await expect(pending).rejects.toMatchObject({ code: 'REGISTRY_TIMEOUT' });
  } finally { jest.useRealTimers(); }
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

test('installs a builtin without changing the active version', async () => {
  const repository = { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() };
  const service = createWorkflowRegistryService({ repository: repository as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0' });

  await service.installBuiltin(definition as never);

  expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
    workflowId: 'demo',
    version: '1.0.0',
    source: 'builtin',
    hashScheme: 'workflow-package/without-declared-hash+sorted-json@1',
  }));
  expect(repository.setActive).not.toHaveBeenCalled();
});

test('rejects incompatible app and adapter versions before installation', async () => {
  const incompatible = { ...definition, compatibility: { minAppVersion: '2.0.0', requiredAdapterVersion: '^9.0.0' } };
  const service = createWorkflowRegistryService({ repository: { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() } as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0', adapterVersions: { demo: '1.0.0' } });
  await expect(service.activateBuiltin(incompatible as never)).rejects.toMatchObject({ code: 'REGISTRY_INCOMPATIBLE' });
});

test('stages a Git package only after commit attestation validation', async () => {
  const repository = { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() };
  const service = createWorkflowRegistryService({ repository: repository as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0' });
  await expect(service.installGitPackage({ repository: 'https://github.com/acme/workflows.git', allowedRef: 'refs/heads/main', registryId: 'acme', key: { registryId: 'acme', publicKey: '00', status: 'active' } }, { repository: 'https://evil.test/repo.git', ref: 'refs/heads/main', commit: 'a'.repeat(40), treeHash: 'b'.repeat(32), entries: [] }, '00', definition)).rejects.toMatchObject({ code: 'REGISTRY_GIT_ATTESTATION_INVALID' });
  expect(repository.upsert).not.toHaveBeenCalled();
});

test('activates a verified remote package after installation', async () => {
  const payload = {
    apiVersion: 'workflow.autodl/v1' as const,
    kind: 'Workflow' as const,
    metadata: { id: 'remote-demo', version: '1.0.0', title: 'Remote Demo', category: 'video' as const },
    spec: {
      adapter: { id: 'demo', version: '1.0.0', operation: 'workflow.submit' },
      inputSchema: { type: 'object' as const, properties: {} },
      bindings: {},
      outputs: { artifacts: [] },
    },
  };
  const contentHash = await sha256Hex(canonicalizeDefinition(payload));
  const responses = [
    new Response(JSON.stringify({ registryId: 'acme', entries: [{ workflowId: 'remote-demo', version: '1.0.0', contentHash, adapter: 'demo', operation: 'workflow.submit', signature: 'index-signature' }], signature: 'index-signature' })),
    new Response(JSON.stringify(payload)),
    new Response('package-signature'),
  ];
  const repository = { upsert: jest.fn(), get: jest.fn(), list: jest.fn(async () => []), setActive: jest.fn(), getActive: jest.fn(), rollback: jest.fn(), removeUnreferenced: jest.fn() };
  const service = createWorkflowRegistryService({ repository: repository as never, adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0', allowDomains: ['example.test'], keyring: [{ registryId: 'acme', publicKey: '00', status: 'active' }], fetch: jest.fn(async () => responses.shift()!) });

  const record = await service.fetchAndActivate('remote-demo', '1.0.0', 'https://registry.example.test');

  expect(record.contentHash).toBe(contentHash);
  expect(record.hashScheme).toBe('workflow-package/without-declared-hash+sorted-json@1');
  expect(repository.upsert).toHaveBeenCalledWith(record);
  expect(repository.setActive).toHaveBeenCalledWith('remote-demo', '1.0.0', contentHash);
});
