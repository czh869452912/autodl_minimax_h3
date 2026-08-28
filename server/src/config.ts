import path from 'node:path';

export type ServerConfig = {
  host: string;
  port: number;
  model: string;
  endpoint: string;
  apiKey: string;
  authSecret: string;
  skillsRoot: string;
};

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerConfigError';
  }
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  const authSecret = env.AUTH_SECRET?.trim();
  if (!apiKey || !model || !authSecret) {
    throw new ServerConfigError('LLM_API_KEY, LLM_MODEL and AUTH_SECRET are required');
  }
  const port = Number(env.PORT ?? 8200);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ServerConfigError('PORT must be an integer between 1 and 65535');
  }
  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port,
    model,
    endpoint: env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1',
    apiKey,
    authSecret,
    skillsRoot: path.resolve(env.H3_SKILLS_ROOT?.trim() || './skills'),
  };
}
