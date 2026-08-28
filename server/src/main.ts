import { createApp, startServer } from './http.js';
import { loadServerConfig } from './config.js';
import { createRuntimeHandler } from './runtime.js';

async function main() {
  const config = loadServerConfig();
  const server = createApp(config, createRuntimeHandler(config));
  await startServer(server, config);
  console.log(`AutoDL H3 agent server listening on http://${config.host}:${config.port}`);
}

void main();
