import { compileWorkflow } from './compiler';
import type { WorkflowDefinition } from '../schema/types';

const definition: WorkflowDefinition = {
  schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic',
  platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' },
  inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 2 }, count: { type: 'integer', minimum: 1, maximum: 3 } } },
  ui: { sections: [{ id: 'main', title: 'Main', fields: ['prompt', 'count'] }] },
  request: { operation: 'workflow.submit', bindings: { text: '/prompt', count: '/count' } }, outputs: { artifacts: [] },
};

test('validates draft values and builds a pointer-based provider request', () => {
  const plan = compileWorkflow(definition, 'hash');
  expect(plan.validateDraft({ prompt: 'ok', count: 2 })).toEqual({ ok: true, value: definition });
  expect(plan.buildRequest({ prompt: 'ok', count: 2 })).toEqual({ text: 'ok', count: 2 });
});

test('returns stable schema errors and caches by content hash', () => {
  const first = compileWorkflow(definition, 'same-hash');
  const second = compileWorkflow(definition, 'same-hash');
  expect(second).toBe(first);
  const result = first.validateDraft({ prompt: '', count: 9 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.map((item) => item.path)).toEqual(expect.arrayContaining(['/prompt', '/count']));
});
