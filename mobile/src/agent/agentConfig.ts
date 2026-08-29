import type { AppSettings } from '../settings/storage';
import type { H3AgentConfig } from './agentTypes';

export function toH3AgentConfig(settings: AppSettings): H3AgentConfig {
  return { apiKey: settings.llmApiKey, endpoint: settings.llmEndpoint, model: settings.llmModel };
}

export function applyAgentSettings(
  _current: { config: H3AgentConfig | null; error: string | null },
  settings: AppSettings,
): { config: H3AgentConfig; error: null } {
  return { config: toH3AgentConfig(settings), error: null };
}
