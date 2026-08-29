import { ChatOpenAI } from '@langchain/openai';
import type { H3AgentConfig } from './agentTypes';

export type ModelFactory = (config: H3AgentConfig) => ChatOpenAI;

export function validateH3AgentConfig(config: H3AgentConfig): void {
  if (!config.apiKey.trim()) throw new Error('LLM API key is required');
  if (!config.endpoint.trim()) throw new Error('LLM API endpoint is required');
  if (!/^https?:\/\//i.test(config.endpoint.trim())) {
    throw new Error('LLM API endpoint must be an HTTP(S) URL');
  }
  if (!config.model.trim()) throw new Error('LLM model is required');
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
