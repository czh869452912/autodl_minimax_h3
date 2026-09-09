import { buildAutodlSubmitRequest, type AutodlInput } from '../workflows/providers/autodl/mapping';
import { buildSubmissionInputSnapshot } from './submissionInput';
import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';

const baseInput = {
  workflowValues: { prompt: 'p', resolution: '768p竖', duration: 5, seed: '' },
  fallback: { prompt: '', resolution: '768p竖', duration: '5', seed: '' },
  images: [],
  audios: [],
};

test.each([
  ['', 0, 1],
  ['   ', 1 - Number.EPSILON, 999999999999999],
])('turns a blank seed into one persisted in-range request value', (seed, randomValue, expected) => {
  const snapshot = buildSubmissionInputSnapshot({
    ...baseInput,
    workflowValues: { ...baseInput.workflowValues, seed },
    random: () => randomValue,
  });

  expect(snapshot.seed).toBe(expected);
  expect(buildAutodlSubmitRequest(snapshot as AutodlInput)).toMatchObject({ seed: expected });
});

test('preserves a user-provided seed without consuming randomness', () => {
  const random = jest.fn(() => 0);
  const snapshot = buildSubmissionInputSnapshot({
    ...baseInput,
    workflowValues: { ...baseInput.workflowValues, seed: ' 42 ' },
    random,
  });

  expect(snapshot.seed).toBe(42);
  expect(random).not.toHaveBeenCalled();
});

test('preserves a non-decimal seed so schema validation can reject it', () => {
  const snapshot = buildSubmissionInputSnapshot({
    ...baseInput,
    workflowValues: { ...baseInput.workflowValues, seed: 'abc' },
  });

  expect(snapshot.seed).toBe('abc');
});

test('uses bound schema fields and its seed range when building the durable snapshot', () => {
  const definition = { ...builtinWorkflowDefinitions[1], inputs: { type: 'object', properties: {
    text: { type: 'string', 'x-workflow.semantic': 'prompt' }, seconds: { type: 'integer' },
    random: { type: 'integer', minimum: 0, maximum: 99 }, photos: { type: 'array' },
  } }, request: { operation: 'workflow.submit', bindings: { prompt: '/text', duration: '/seconds', seed: '/random', images: '/photos' } } };
  const snapshot = buildSubmissionInputSnapshot({ ...baseInput, definition, workflowValues: { text: ' p ', seconds: '7', random: '' }, random: () => 0 });
  expect(snapshot).toEqual({ text: 'p', seconds: 7, random: 0, photos: [] });
});
