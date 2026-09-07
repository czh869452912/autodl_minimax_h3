export type H3AgentConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
};

export type H3ContextBudget = { inputTokens: number; outputTokens: number };
export function getH3ContextBudget(config: Partial<H3AgentConfig> = {}): H3ContextBudget {
  const window = config.contextWindowTokens ?? 32_768;
  const outputTokens = config.maxOutputTokens ?? 4_096;
  if (!Number.isInteger(window) || !Number.isInteger(outputTokens) || window < 8192 || outputTokens < 256 || outputTokens > window / 2) throw new Error('Invalid model context or output token budget');
  return { inputTokens: window - outputTokens, outputTokens };
}

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
export const H3_GRAPH_VERSION = 'deepagents-1.13.2/h3-workspace-1';
