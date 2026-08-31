import { validateWorkflowDefinition } from './validator';

const base = {
  schemaVersion: '1.0', id: 'demo.workflow', version: '1.0.0', kind: 'atomic',
  platform: { adapter: 'demo', operation: 'workflow.submit' },
  metadata: { title: 'Demo', category: 'video' },
  inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 1, 'x-workflow.semantic': 'prompt', 'x-workflow.widget': 'textarea' } } },
  request: { operation: 'workflow.submit', bindings: { prompt: 'prompt' } },
  outputs: { artifacts: [{ kind: 'video', from: 'result.video' }] },
};

test('accepts a valid atomic workflow definition', () => {
  const result = validateWorkflowDefinition(base, { adapters: [{ id: 'demo', operations: ['workflow.submit'] }] });
  expect(result.ok).toBe(true);
});

test('requires a safe provider workflow id when a platform declares one', () => {
  const result = validateWorkflowDefinition({ ...base, platform: { ...base.platform, workflowId: 'bad/id' } }, { adapters: [{ id: 'demo', operations: ['workflow.submit'] }] });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.map((error) => error.code)).toContain('WORKFLOW_ID_INVALID');
});

test('rejects unknown widgets and remote references', () => {
  const result = validateWorkflowDefinition({ ...base, inputs: { type: 'object', properties: { prompt: { type: 'string', '$ref': 'https://evil.test/schema', 'x-workflow.widget': 'evil' } } } });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['UNKNOWN_WIDGET', 'REMOTE_REF']));
});

test('rejects composite definitions for M1/M2 activation', () => {
  const result = validateWorkflowDefinition({ ...base, kind: 'composite' });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors[0].code).toBe('COMPOSITE_UNSUPPORTED');
});

test('rejects operations not exposed by the installed adapter', () => {
  const result = validateWorkflowDefinition(base, { adapters: [{ id: 'other', operations: [] }] });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors[0].code).toBe('UNSUPPORTED_ADAPTER');
});
