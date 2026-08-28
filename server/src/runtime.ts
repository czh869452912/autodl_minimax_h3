import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';
import type { ServerConfig } from './config.js';
import { AGENT_ID, createH3Agent } from './agent.js';
import { H3AgUiAgent } from './aguiAgent.js';

export function createCopilotRuntime(config: ServerConfig) {
  const graph = createH3Agent(config);
  return new CopilotRuntime({
    agents: {
      [AGENT_ID]: new H3AgUiAgent(graph),
    },
  });
}

export function createRuntimeHandler(config: ServerConfig) {
  const runtime = createCopilotRuntime(config);
  return createCopilotNodeListener({
    runtime,
    basePath: '/api/copilotkit',
    cors: true,
    activateChannels: false,
  });
}
