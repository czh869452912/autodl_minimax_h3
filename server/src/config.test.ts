import { loadServerConfig, ServerConfigError } from './config.js';

describe('server configuration', () => {
  it('requires credentials and model configuration', () => {
    expect(() => loadServerConfig({})).toThrow(ServerConfigError);
  });

  it('parses safe defaults without returning secrets in public fields', () => {
    const config = loadServerConfig({
      LLM_API_KEY: 'test-key',
      LLM_MODEL: 'openai:gpt-5-mini',
      LLM_BASE_URL: 'https://llm.example.test/v1',
      AUTH_SECRET: 'test-secret',
      H3_SKILLS_ROOT: './skills',
    });
    expect(config).toMatchObject({ host: '0.0.0.0', port: 8200, model: 'openai:gpt-5-mini' });
    expect(config.apiKey).toBe('test-key');
    expect(config.authSecret).toBe('test-secret');
  });
});
