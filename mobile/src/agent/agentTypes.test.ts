import { isH3AgentConfigReady } from './agentTypes';

it('does not construct the local harness until all LLM settings exist', () => {
  expect(isH3AgentConfigReady({ apiKey: '', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', timeoutMs: 600000, maxRetries: 2 })).toBe(false);
  expect(isH3AgentConfigReady({ apiKey: 'key', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', timeoutMs: 600000, maxRetries: 2 })).toBe(true);
});
