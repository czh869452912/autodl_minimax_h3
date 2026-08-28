import { loadServerConfig } from './config.js';
import { createCopilotRuntime, createRuntimeHandler } from './runtime.js';

jest.mock('@copilotkit/runtime/v2', () => ({ CopilotRuntime: class { constructor(public options: unknown) {} } }));
jest.mock('@copilotkit/runtime/v2/node', () => ({ createCopilotNodeListener: () => () => undefined }));

const config = loadServerConfig({
  LLM_API_KEY: 'test-key', LLM_MODEL: 'openai:gpt-5-mini',
  LLM_BASE_URL: 'https://llm.example.test/v1', AUTH_SECRET: 'test-secret',
  H3_SKILLS_ROOT: './skills/minimax-h3',
});

describe('Copilot Runtime', () => {
  it('registers the H3 agent in the runtime', () => {
    expect(createCopilotRuntime(config)).toBeDefined();
  });

  it('creates a Node AG-UI request listener', () => {
    expect(typeof createRuntimeHandler(config)).toBe('function');
  });
});
