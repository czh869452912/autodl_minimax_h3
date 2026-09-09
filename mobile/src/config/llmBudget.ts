import { DEFAULT_CONTEXT_TOKENS, DEFAULT_OUTPUT_TOKENS } from './llmDefaults';

export type H3ContextBudget = { inputTokens: number; outputTokens: number };
type TokenBudget = { contextWindowTokens?: number; maxOutputTokens?: number };
export function getH3ContextBudget<T extends object = object>(config: T & TokenBudget = {} as T & TokenBudget): H3ContextBudget {
  const window = config.contextWindowTokens ?? DEFAULT_CONTEXT_TOKENS;
  const outputTokens = config.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS;
  if (!Number.isInteger(window) || !Number.isInteger(outputTokens) || window < 8192 || outputTokens < 256 || outputTokens > window / 2) throw new Error('Invalid model context or output token budget');
  return { inputTokens: window - outputTokens, outputTokens };
}
