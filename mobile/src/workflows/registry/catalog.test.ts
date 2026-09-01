import { createWorkflowCatalog, registryRecordToDefinition } from './catalog';
import type { WorkflowRegistry } from './types';
import type { WorkflowDefinition } from '../schema/types';

const definition: WorkflowDefinition = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', properties: {} }, request: { operation: 'workflow.submit', bindings: {} }, outputs: { artifacts: [] } };
function memoryRegistry(): WorkflowRegistry { const data = new Map<string, any>(); const active = new Map<string, any>(); return { upsert: async (r) => { data.set(`${r.workflowId}:${r.version}`, r); }, get: async (id, v) => data.get(`${id}:${v}`), list: async () => [...data.values()], setActive: async (id, v, h) => { active.set(id, await data.get(`${id}:${v}`)); }, getActive: async (id) => active.get(id), rollback: async () => {}, removeUnreferenced: async () => {} }; }

test('bootstraps builtin definitions and exposes active catalog records', async () => {
  const registry = memoryRegistry();
  const catalog = createWorkflowCatalog({ registry, builtins: [definition], adapters: [{ id: 'demo', operations: ['workflow.submit'] }], appVersion: '1.0.0' });
  await catalog.bootstrap();
  expect((await catalog.listActive())[0]).toMatchObject({ workflowId: 'demo', source: 'builtin' });
  expect((await catalog.getActive('demo'))?.definitionJson).toContain('"id":"demo"');
});

test('converts package-backed registry records for form consumers', () => {
  const pkg = {
    apiVersion: 'workflow.autodl/v1' as const,
    kind: 'Workflow' as const,
    metadata: { id: 'demo', version: '1.0.0', title: 'Demo', category: 'video' as const },
    spec: {
      adapter: { id: 'demo', version: '1.0.0', operation: 'workflow.submit' },
      inputSchema: { type: 'object' as const, properties: { prompt: { type: 'string' as const } } },
      bindings: { prompt: '/prompt' },
      outputs: { artifacts: [] },
    },
  };
  const record = { workflowId: 'demo', version: '1.0.0', contentHash: 'hash', source: 'builtin' as const, trust: 'builtin' as const, definitionJson: JSON.stringify(pkg), installedAt: 1 };
  expect(registryRecordToDefinition(record).id).toBe('demo');
  expect((registryRecordToDefinition(record).inputs.properties as Record<string, unknown>)?.prompt).toEqual({ type: 'string' });
});
