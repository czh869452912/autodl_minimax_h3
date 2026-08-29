import { ChatOpenAI } from '@langchain/openai';
import type { H3AgentConfig } from './agentTypes';

export type ModelFactory = (config: H3AgentConfig) => ChatOpenAI;

export function getH3AgentConfigError(config: H3AgentConfig): string | null {
  if (!config.apiKey.trim()) return 'LLM API key is required';
  if (!config.endpoint.trim()) return 'LLM API endpoint is required';
  if (!/^https?:\/\//i.test(config.endpoint.trim())) return 'LLM API endpoint must be an HTTP(S) URL';
  if (!config.model.trim()) return 'LLM model is required';
  return null;
}

export function validateH3AgentConfig(config: H3AgentConfig): void {
  const error = getH3AgentConfigError(config);
  if (error) throw new Error(error);
}

export function createOpenAICompatibleModel(config: H3AgentConfig): ChatOpenAI {
  validateH3AgentConfig(config);
  return new ChatOpenAI({
    model: config.model.trim(),
    temperature: 0.3,
    apiKey: config.apiKey.trim(),
    configuration: {
      baseURL: config.endpoint.trim(),
      dangerouslyAllowBrowser: true,
    },
  });
}
