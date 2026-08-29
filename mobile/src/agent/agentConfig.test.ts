import { applyAgentSettings, toH3AgentConfig } from './agentConfig';

it('maps secure settings into the local harness configuration', () => {
  expect(toH3AgentConfig({
    token: 'autodl',
    llmApiKey: 'key',
    llmEndpoint: 'https://llm.example/v1',
    llmModel: 'model',
  })).toEqual({ apiKey: 'key', endpoint: 'https://llm.example/v1', model: 'model' });
});

it('clears a stale screen error when settings are loaded successfully', () => {
  expect(applyAgentSettings({ config: null, error: 'Cannot read property includes' }, {
    token: 'autodl',
    llmApiKey: 'key',
    llmEndpoint: 'https://llm.example/v1',
    llmModel: 'model',
  })).toEqual({
    config: { apiKey: 'key', endpoint: 'https://llm.example/v1', model: 'model' },
    error: null,
  });
});
