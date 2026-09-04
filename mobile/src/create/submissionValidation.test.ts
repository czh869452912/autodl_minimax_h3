import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';
import type { RegistryRecord } from '../workflows/registry/types';
import { formatSubmissionFieldError, validateSubmissionBeforeQueue } from './submissionValidation';

const definition = builtinWorkflowDefinitions[1];
const loaded: RegistryRecord = {
  workflowId: definition.id,
  version: definition.version,
  contentHash: 'h3-1.0.1',
  hashScheme: 'workflow-package/without-declared-hash+sorted-json@1',
  source: 'builtin',
  trust: 'builtin',
  definitionJson: JSON.stringify(definition),
  installedAt: 1,
};
const baseInputs = {
  prompt: 'p',
  resolution: '768p竖',
  duration: 5,
  seed: 42,
  images: [],
  audios: [],
};

const validate = (inputs: Record<string, unknown>, ...activeOverride: [RegistryRecord | undefined] | []) =>
  validateSubmissionBeforeQueue({ definition, loaded, active: activeOverride.length ? activeOverride[0] : loaded, inputs });

test('accepts the exact prompt boundary and explains one character over it', () => {
  expect(validate({ ...baseInputs, prompt: 'a'.repeat(10_000) })).toEqual({ ok: true });
  const result = validate({ ...baseInputs, prompt: 'a'.repeat(10_001) });
  expect(result).toMatchObject({ ok: false, fieldErrors: [{ field: 'prompt', path: '/prompt', code: 'MAX_LENGTH' }] });
  if (!result.ok) {
    expect(formatSubmissionFieldError(result.fieldErrors[0], definition)).toBe('Prompt（视频描述）最多 10,000 个字符，当前 10,001 个。');
  }
});

test.each([
  [{ duration: 0 }, 'duration', 'MINIMUM'],
  [{ duration: 16 }, 'duration', 'MAXIMUM'],
  [{ duration: 1.5 }, 'duration', 'TYPE_INVALID'],
  [{ resolution: '1080p' }, 'resolution', 'ENUM_INVALID'],
  [{ seed: 0 }, 'seed', 'MINIMUM'],
  [{ seed: 1_000_000_000_000_000 }, 'seed', 'MAXIMUM'],
  [{ seed: 'abc' }, 'seed', 'TYPE_INVALID'],
  [{ images: Array.from({ length: 10 }, () => ({})) }, 'images', 'MAX_ITEMS'],
  [{ audios: Array.from({ length: 4 }, () => ({})) }, 'audios', 'MAX_ITEMS'],
])('rejects invalid schema input %j', (change, field, code) => {
  expect(validate({ ...baseInputs, ...change })).toMatchObject({ ok: false, fieldErrors: [{ field, code }] });
});

test('rejects a stale or missing active workflow before schema validation', () => {
  expect(validate(baseInputs, undefined)).toMatchObject({ ok: false, fieldErrors: [{ code: 'WORKFLOW_CHANGED' }] });
  expect(validate(baseInputs, { ...loaded, contentHash: 'new-hash' })).toMatchObject({ ok: false, fieldErrors: [{ code: 'WORKFLOW_CHANGED' }] });
});
