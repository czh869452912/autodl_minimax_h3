export const DEFAULT_CONTEXT_TOKENS = 32_768;
export const DEFAULT_OUTPUT_TOKENS = 4_096;

export const DEFAULT_LLM_ADVANCED_SETTINGS = {
  llmTimeoutSeconds: '600',
  llmMaxRetries: '2',
  llmContextWindowTokens: String(DEFAULT_CONTEXT_TOKENS),
  llmMaxOutputTokens: String(DEFAULT_OUTPUT_TOKENS),
  llmReasoningEffort: 'default' as const,
};
