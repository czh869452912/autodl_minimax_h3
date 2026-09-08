jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn().mockImplementation((options) => options) }));
jest.mock('./DeepSeekCompletions', () => ({ DeepSeekCompletions: jest.fn() }));
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

  it('sets an explicit output allowance for unknown compatible models', () => {
    createOpenAICompatibleModel({ apiKey: 'test', endpoint: 'https://example.test/v1', model: 'unknown', timeoutMs: 1000, maxRetries: 0 });
    expect(ChatOpenAI).toHaveBeenLastCalledWith(expect.objectContaining({ maxTokens: 4096 }));
  });

  it('rejects a context budget that cannot reserve the configured output', () => {
    expect(getH3AgentConfigError({ apiKey: 'test', endpoint: 'https://example.test/v1', model: 'unknown', timeoutMs: 1000, maxRetries: 0, contextWindowTokens: 8192, maxOutputTokens: 7000 })).toMatch(/budget/i);
  });

  it.each(['low', 'high', 'max'] as const)('sends DeepSeek V4 effort %s via provider request fields', effort => {
    createOpenAICompatibleModel({ apiKey: 'test', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutMs: 1000, maxRetries: 0, reasoningEffort: effort, maxOutputTokens: 8192 });
    expect(ChatOpenAI).toHaveBeenLastCalledWith(expect.objectContaining({ maxTokens: 8192, modelKwargs: { thinking: { type: 'enabled' }, reasoning_effort: effort } }));
  });

  it('turns DeepSeek thinking off without sending an unsupported none effort', () => {
    createOpenAICompatibleModel({ apiKey: 'test', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-pro', timeoutMs: 1000, maxRetries: 0, reasoningEffort: 'none' });
    expect(ChatOpenAI).toHaveBeenLastCalledWith(expect.objectContaining({ modelKwargs: { thinking: { type: 'disabled' } } }));
  });

  it('leaves provider reasoning defaults untouched', () => {
    createOpenAICompatibleModel({ apiKey: 'test', endpoint: 'https://example.test/v1', model: 'unknown', timeoutMs: 1000, maxRetries: 0, reasoningEffort: 'default' });
    const options = jest.mocked(ChatOpenAI).mock.calls.at(-1)![0] as any;
    expect(options.modelKwargs?.reasoning_effort).toBeUndefined();
    expect(options.modelKwargs?.thinking).toBeUndefined();
  });

  it('passes effort through for compatible model names unknown to LangChain', () => {
    createOpenAICompatibleModel({ apiKey: 'test', endpoint: 'https://example.test/v1', model: 'custom-reasoner', timeoutMs: 1000, maxRetries: 0, reasoningEffort: 'medium' });
    expect(ChatOpenAI).toHaveBeenLastCalledWith(expect.objectContaining({ modelKwargs: { reasoning_effort: 'medium' } }));
  });
});
