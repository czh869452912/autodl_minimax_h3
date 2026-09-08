import { ChatOpenAI, type ChatOpenAIFields } from '@langchain/openai';
import type { H3AgentConfig } from './agentTypes';
import { createStreamingFetch } from '../shims/copilotKitStreamingFetch';
import { getH3ContextBudget } from './agentTypes';
import { isDeepSeekV4, reasoningRequestFields, validateReasoningEffort } from './reasoningConfig';
import { DeepSeekCompletions } from './DeepSeekCompletions';

export type ModelFactory = (config: H3AgentConfig) => ChatOpenAI;

export function getH3AgentConfigError(config: H3AgentConfig): string | null {
  if (!config.apiKey.trim()) return 'LLM API key is required';
  if (!config.endpoint.trim()) return 'LLM API endpoint is required';
  if (!/^https?:\/\//i.test(config.endpoint.trim())) return 'LLM API endpoint must be an HTTP(S) URL';
  if (!config.model.trim()) return 'LLM model is required';
  try { getH3ContextBudget(config); } catch (error) { return (error as Error).message; }
  try { validateReasoningEffort(config.model, config.reasoningEffort); } catch (error) { return (error as Error).message; }
  return null;
}

export function validateH3AgentConfig(config: H3AgentConfig): void {
  const error = getH3AgentConfigError(config);
  if (error) throw new Error(error);
}

export function createOpenAICompatibleModel(config: H3AgentConfig): ChatOpenAI {
  validateH3AgentConfig(config);
  // Match the installed SDK's reasoning-model detection so it can translate
  // effort into either Chat Completions or Responses parameters.
  const sdkReasoning = /^(?:o\d|gpt-5(?!-chat))/.test(config.model.trim());
  const effort = config.reasoningEffort;
  const fields: ChatOpenAIFields = {
    model: config.model.trim(),
    // OpenAI reasoning modes reject custom sampling temperatures.
    temperature: (sdkReasoning && effort !== 'none') || config.model.includes('codex') ? undefined : 0.3,
    // The installed SDK omits the original GPT-5 Pro from its Responses list.
    ...(/^gpt-5-pro(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model.trim()) ? { useResponsesApi: true } : {}),
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
    maxTokens: getH3ContextBudget(config).outputTokens,
    ...(sdkReasoning && effort && effort !== 'default' && effort !== 'max' ? { reasoning: { effort } } : {}),
    modelKwargs: sdkReasoning ? {} : config.model.includes('codex') && effort && effort !== 'default'
      ? { reasoning: { effort } } : reasoningRequestFields(config.model, effort),
    apiKey: config.apiKey.trim(),
    configuration: {
      baseURL: config.endpoint.trim(),
      dangerouslyAllowBrowser: true,
      fetch: createStreamingFetch({ timeoutMs: config.timeoutMs }),
    },
  };
  return new ChatOpenAI({ ...fields, ...(isDeepSeekV4(config.model) && config.reasoningEffort !== 'none' ? { completions: new DeepSeekCompletions(fields) } : {}) });
}
