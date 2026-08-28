import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ServerConfig } from './config.js';

export type RuntimeHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

export function createApp(config: ServerConfig, runtimeHandler?: RuntimeHandler): Server {
  return createServer((request, response) => {
    if (request.url === '/healthz' && request.method === 'GET') {
      json(response, 200, { status: 'ok', agent: 'h3-prompt-assistant' });
      return;
    }
    if (request.url?.startsWith('/api/copilotkit')) {
      const authorization = request.headers.authorization;
      if (authorization !== `Bearer ${config.authSecret}`) {
        json(response, 401, { error: 'unauthorized' });
        return;
      }
      if (!runtimeHandler) {
        json(response, 503, { error: 'runtime_not_ready' });
        return;
      }
      void runtimeHandler(request, response);
      return;
    }
    json(response, 404, { error: 'not_found' });
  });
}

export function listenForTest(server: Server): Promise<ReturnType<Server['address']>> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export function startServer(server: Server, config: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
}
