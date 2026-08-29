import { applyAgentSettings, toH3AgentConfig } from './agentConfig';

it('maps secure settings into the local harness configuration', () => {
  expect(toH3AgentConfig({
    token: 'autodl',
    llmApiKey: 'key',
    llmEndpoint: 'https://llm.example/v1',
    llmModel: 'model',
    llmTimeoutSeconds: '900',
    llmMaxRetries: '3',
    autoExportToGallery: true,
    keepPrivateCopy: true,
  })).toEqual({ apiKey: 'key', endpoint: 'https://llm.example/v1', model: 'model', timeoutMs: 900000, maxRetries: 3 });
});

it('clears a stale screen error when settings are loaded successfully', () => {
  expect(applyAgentSettings({ config: null, error: 'Cannot read property includes' }, {
    token: 'autodl',
    llmApiKey: 'key',
    llmEndpoint: 'https://llm.example/v1',
    llmModel: 'model',
    llmTimeoutSeconds: '600',
    llmMaxRetries: '2',
    autoExportToGallery: true,
    keepPrivateCopy: true,
  })).toEqual({
    config: { apiKey: 'key', endpoint: 'https://llm.example/v1', model: 'model', timeoutMs: 600000, maxRetries: 2 },
    error: null,
  });
});
