import { legacyDefinitionToPackage, parseWorkflowPackage, packageToDefinition } from './package';

const input = {
  apiVersion: 'workflow.autodl/v1',
  kind: 'Workflow',
  metadata: { id: 'demo.video', version: '1.2.0', title: 'Demo', category: 'video', channel: 'stable' },
  spec: {
    adapter: { id: 'demo', version: '^2.0.0', operation: 'workflow.submit', workflowId: 'demo_v1' },
    inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
    uiSchema: { sections: [{ id: 'main', title: 'Main', fields: ['/prompt'] }] },
    bindings: { prompt: '/prompt' },
    outputs: { artifacts: [{ kind: 'video', from: '/result/video' }] },
    compatibility: { minAppVersion: '1.4.0', requiredAdapterVersion: '^2.0.0', artifactKinds: ['video'] },
  },
};

test('parses a declarative workflow package and compiles it to a definition', () => {
  const pkg = parseWorkflowPackage(input);
  const definition = packageToDefinition(pkg);
  expect(definition).toMatchObject({ id: 'demo.video', version: '1.2.0', platform: { adapter: 'demo' }, request: { bindings: { prompt: '/prompt' } } });
  expect(definition.ui?.sections[0].fields).toEqual(['prompt']);
});

test('rejects remote references and executable fields anywhere in a package', () => {
  expect(() => parseWorkflowPackage({ ...input, spec: { ...input.spec, script: 'fetch("https://evil.test")' } })).toThrow('forbidden field');
  expect(() => parseWorkflowPackage({ ...input, spec: { ...input.spec, inputSchema: { $ref: 'https://evil.test/schema.json' } } })).toThrow('remote references');
});

test('converts legacy dotted bindings to JSON Pointers at the boundary', () => {
  const legacy = {
    schemaVersion: '1.0', id: 'legacy', version: '1.0.0', kind: 'atomic',
    platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Legacy', category: 'video' },
    inputs: { type: 'object', properties: { nested: { type: 'object', properties: { prompt: { type: 'string' } } } } },
    request: { operation: 'workflow.submit', bindings: { prompt: 'nested.prompt' } }, outputs: { artifacts: [] },
  } as unknown as import('./types').WorkflowDefinition;
  expect(legacyDefinitionToPackage(legacy).spec.bindings.prompt).toBe('/nested/prompt');
});

test('rejects malformed ids, versions, pointers, and UI references', () => {
  expect(() => parseWorkflowPackage({ ...input, metadata: { ...input.metadata, id: '../demo' } })).toThrow('metadata.id');
  expect(() => parseWorkflowPackage({ ...input, metadata: { ...input.metadata, version: 'latest' } })).toThrow('metadata.version');
  expect(() => parseWorkflowPackage({ ...input, spec: { ...input.spec, bindings: { prompt: 'prompt' } } })).toThrow('JSON Pointer');
  expect(() => parseWorkflowPackage({ ...input, spec: { ...input.spec, uiSchema: { sections: [{ id: 'bad', title: 'Bad', fields: ['/missing'] }] } } })).toThrow('unknown input');
});
