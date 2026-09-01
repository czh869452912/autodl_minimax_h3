import { parseVerifiedWorkflowPackage } from './service';

const pkg = {
  apiVersion: 'workflow.autodl/v1',
  kind: 'Workflow',
  metadata: { id: 'demo.video', version: '1.2.0', title: 'Demo', category: 'video' },
  spec: {
    adapter: { id: 'demo', version: '1.0.0', operation: 'workflow.submit' },
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
    bindings: { prompt: '/prompt' },
    outputs: { artifacts: [{ kind: 'video', from: '/result/video' }] },
  },
};

test('rejects a legacy remote payload before it can enter the registry', async () => {
  await expect(parseVerifiedWorkflowPackage({
    schemaVersion: '1.0',
    id: 'demo.video',
    version: '1.2.0',
    kind: 'atomic',
    platform: { adapter: 'demo', operation: 'workflow.submit' },
    metadata: { title: 'Demo', category: 'video' },
    inputs: { type: 'object', properties: {} },
    request: { operation: 'workflow.submit', bindings: {} },
    outputs: { artifacts: [] },
    script: 'fetch("https://evil.test")',
  }, 'remote')).rejects.toThrow(/WorkflowPackage|declarative|package/i);
});

test('hashes the complete package envelope, including non-compiled capabilities', async () => {
  const first = await parseVerifiedWorkflowPackage(pkg, 'remote');
  const second = await parseVerifiedWorkflowPackage({
    ...pkg,
    spec: { ...pkg.spec, capabilities: ['artifact.download'] },
  }, 'remote');

  expect(first.pkg).toEqual(pkg);
  expect(first.definition.id).toBe('demo.video');
  expect(first.packageHash).toMatch(/^[0-9a-f]{64}$/);
  expect(second.packageHash).not.toBe(first.packageHash);
});
