export type H3AgentConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

export type H3AgentInput = {
  threadId: string;
  messages: readonly unknown[];
  signal: AbortSignal;
};

export function isH3AgentConfigReady(config: H3AgentConfig): boolean {
  return Boolean(config.apiKey.trim() && config.endpoint.trim() && config.model.trim());
}


export type H3AgentEvent =
  | { type: 'text'; delta: string; phase: 'thinking' | 'final' }
  | { type: 'tool-start'; id: string; name: string; args: unknown }
  | { type: 'tool-end'; id: string }
  | { type: 'status'; message: string }
  | { type: 'error'; error: Error };
