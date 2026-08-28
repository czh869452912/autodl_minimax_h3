import path from 'node:path';
import { loadServerConfig } from './config.js';
import { AGENT_ID, createH3Agent } from './agent.js';

const config = loadServerConfig({
  LLM_API_KEY: 'test-key',
  LLM_MODEL: 'openai:gpt-5-mini',
  LLM_BASE_URL: 'https://llm.example.test/v1',
  AUTH_SECRET: 'test-secret',
  H3_SKILLS_ROOT: path.resolve(__dirname, '../skills/minimax-h3'),
});

describe('H3 DeepAgent', () => {
  it('creates a named server-side agent with the official skill root', () => {
    const agent = createH3Agent(config);
    expect(agent).toBeDefined();
    expect(AGENT_ID).toBe('h3-prompt-assistant');
  });
});
