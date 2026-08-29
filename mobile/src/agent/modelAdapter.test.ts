jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn().mockImplementation((options) => options) }));
import { ChatOpenAI } from '@langchain/openai';
import { createOpenAICompatibleModel, getH3AgentConfigError } from './modelAdapter';

describe('H3 model configuration validation', () => {
  it('returns a recoverable message for a non-URL endpoint instead of requiring a render-time crash', () => {
    expect(getH3AgentConfigError({
      apiKey: 'test-key',
      endpoint: 'deepseek-v4-flash-vision-exp',
      model: 'deepseek-v4-flash',
      timeoutMs: 600000, maxRetries: 2,
    })).toBe('LLM API endpoint must be an HTTP(S) URL');
  });

  it('returns null for a complete OpenAI-compatible endpoint', () => {
    expect(getH3AgentConfigError({
      apiKey: 'test-key',
      endpoint: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash-vision-exp',
      timeoutMs: 600000, maxRetries: 2,
    })).toBeNull();
  });

  it('passes the configured timeout and retry count to ChatOpenAI', () => {
    createOpenAICompatibleModel({
      apiKey: 'test-key', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash-vision-exp',
      timeoutMs: 900000, maxRetries: 4,
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ timeout: 900000, maxRetries: 4 }));
  });
});
