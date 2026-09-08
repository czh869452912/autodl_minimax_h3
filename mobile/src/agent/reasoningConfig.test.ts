import { reasoningOptions, validateReasoningEffort } from './reasoningConfig';

it.each([
  ['gpt-5', ['default', 'minimal', 'low', 'medium', 'high']],
  ['gpt-5-mini', ['default', 'minimal', 'low', 'medium', 'high']],
  ['gpt-5-nano-2025-08-07', ['default', 'minimal', 'low', 'medium', 'high']],
  ['o3', ['default', 'low', 'medium', 'high']],
  ['o4-mini-2025-04-16', ['default', 'low', 'medium', 'high']],
  ['gpt-5.1', ['default', 'none', 'low', 'medium', 'high']],
  ['gpt-5.1-2025-11-13', ['default', 'none', 'low', 'medium', 'high']],
  ['gpt-5.2', ['default', 'none', 'low', 'medium', 'high', 'xhigh']],
  ['gpt-5-pro', ['default', 'high']],
  ['gpt-5.2-pro', ['default', 'medium', 'high', 'xhigh']],
])('offers documented effort values for %s', (model, expected) => {
  expect(reasoningOptions(model).map(option => option.value)).toEqual(expected);
});

it.each(['gpt-5', 'gpt-5-mini', 'o1', 'o3', 'o4-mini'])('rejects unsupported none instead of silently enabling reasoning: %s', model => {
  expect(() => validateReasoningEffort(model, 'none')).toThrow(/思考强度/);
});

it('keeps unknown provider choices and DeepSeek-specific choices independent', () => {
  expect(reasoningOptions('custom-reasoner').map(option => option.value)).toContain('none');
  expect(reasoningOptions('deepseek-v4-flash').map(option => option.value)).toEqual(['default', 'none', 'low', 'high', 'max']);
});
