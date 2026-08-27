export interface ServerConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    apiKey: env.MINIMAX_API_KEY || env.LLM_API_KEY || '',
    endpoint: (env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1').replace(/\/+$/, ''),
    model: env.MINIMAX_MODEL || 'abab6.5s-chat'
  };
}
