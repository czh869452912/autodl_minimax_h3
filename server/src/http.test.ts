import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { closeServer, createApp, listenForTest } from './http.js';
import { loadServerConfig } from './config.js';

const testConfig = () => loadServerConfig({
  PORT: '8200',
  HOST: '127.0.0.1',
  LLM_MODEL: 'openai:gpt-5-mini',
  LLM_API_KEY: 'test-key',
  LLM_BASE_URL: 'https://llm.example.test/v1',
  AUTH_SECRET: 'test-secret',
  H3_SKILLS_ROOT: './skills',
});

describe('agent server HTTP shell', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createApp(testConfig());
    const address = await listenForTest(server);
    const info = address as AddressInfo;
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterEach(async () => {
    await closeServer(server);
  });

  it('reports a healthy server without exposing secrets', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', agent: 'h3-prompt-assistant' });
  });
});
