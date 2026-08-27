import { createCopilotExpressHandler, CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotH3Agent } from './agent/deepAgent';
import type { ServerConfig } from './config';

export function createH3CopilotRouter(config: ServerConfig) {
  const runtime = new CopilotRuntime({
    agents: {
      default: createCopilotH3Agent(config),
    },
  });

  return createCopilotExpressHandler({
    runtime,
    basePath: '/api/copilotkit',
    cors: false,
  });
}

