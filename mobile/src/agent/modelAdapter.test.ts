jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
import { getH3AgentConfigError } from './modelAdapter';

describe('H3 model configuration validation', () => {
  it('returns a recoverable message for a non-URL endpoint instead of requiring a render-time crash', () => {
    expect(getH3AgentConfigError({
      apiKey: 'test-key',
      endpoint: 'deepseek-v4-flash-vision-exp',
      model: 'deepseek-v4-flash',
    })).toBe('LLM API endpoint must be an HTTP(S) URL');
  });

  it('returns null for a complete OpenAI-compatible endpoint', () => {
    expect(getH3AgentConfigError({
      apiKey: 'test-key',
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash-vision-exp',
    })).toBeNull();
  });
});
