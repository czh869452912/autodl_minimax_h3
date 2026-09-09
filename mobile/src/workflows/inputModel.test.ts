import oldPackage from './definitions/autodl/minimax-h3-i2v-15s-v1.0.1.package.json';
import { packageToDefinition, type WorkflowPackage } from './schema/package';
import { alignWorkflowInputs, normalizeWorkflowInputs, mediaConstraints } from './inputModel';

const old = packageToDefinition(oldPackage as WorkflowPackage);
const upgraded = { ...old, id: 'zm', inputs: { ...old.inputs, required: ['prompt', 'images'], properties: { ...old.inputs.properties as object,
  resolution: { type: 'string', enum: ['768p竖', '768p(1:1)'], default: '768p竖' },
  seed: { type: 'integer', minimum: 0, maximum: 999999999999999 },
  images: { type: 'array', minItems: 1, maxItems: 9 },
  audios: { type: 'array', maxItems: 3, items: { type: 'object', required: ['mime'], properties: { mime: { type: 'string', enum: ['audio/mpeg', 'audio/wav', 'audio/flac'] } } } },
} } };

test('preserves zero and square inputs for the upgraded workflow', () => {
  const result = alignWorkflowInputs(upgraded, { prompt: 'scene', resolution: '768p(1:1)', durationSeconds: 8, seed: '0' });
  expect(result.values).toMatchObject({ prompt: 'scene', resolution: '768p(1:1)', duration: 8, seed: 0 });
  expect(result.notices).toEqual([]);
});

test('changes an unsupported enum visibly but keeps an out of range seed for correction', () => {
  const result = alignWorkflowInputs(old, { prompt: 'scene', resolution: '768p(1:1)', seed: '0', extra: 7 });
  expect(result.values).toMatchObject({ resolution: '768p竖', seed: 0, duration: 5 });
  expect(result.values).not.toHaveProperty('extra');
  expect(result.notices.length).toBeGreaterThan(0);
  expect(result.errors.some(error => error.path === '/seed')).toBe(true);
});

test('aligns canonical parameters into explicitly bound schema fields', () => {
  const renamed = { ...old, inputs: { type: 'object', properties: { seconds: { type: 'integer', default: 5 }, text: { type: 'string' } } }, request: { ...old.request, bindings: { duration: '/seconds', prompt: '/text' } } };
  expect(alignWorkflowInputs(renamed, { prompt: 'scene', durationSeconds: 7 }).values).toEqual({ text: 'scene', seconds: 7 });
});

test('normalizes only schema-owned numeric fields without treating zero as empty', () => {
  expect(normalizeWorkflowInputs(upgraded, { prompt: ' scene ', duration: '8', seed: '0' })).toMatchObject({ prompt: 'scene', duration: 8, seed: 0 });
  expect(normalizeWorkflowInputs(upgraded, { seed: '' })).not.toHaveProperty('seed');
});

test('retains valid numeric enum values typed as strings', () => {
  const definition = { ...old, inputs: { ...old.inputs, properties: { ...old.inputs.properties as object, duration: { type: 'integer', enum: [5, 8], default: 5 } } } };
  expect(alignWorkflowInputs(definition, { duration: '8' }).values.duration).toBe(8);
});

test('uses per-workflow media constraints and keeps m4a supported for the old workflow', () => {
  expect(mediaConstraints(upgraded, 'images')).toMatchObject({ minimum: 1, maximum: 9 });
  expect(mediaConstraints(upgraded, 'audios').mimes).not.toContain('audio/mp4');
  expect(mediaConstraints(old, 'audios').mimes).toContain('audio/mp4');
});
