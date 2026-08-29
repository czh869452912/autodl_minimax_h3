import type { AppSettings } from './storage';

export function prepareSettingsForSave(values: AppSettings): AppSettings {
  const normalized = {
    token: values.token.trim(),
    llmEndpoint: values.llmEndpoint.trim().replace(/\/$/, ''),
    llmModel: values.llmModel.trim(),
    llmApiKey: values.llmApiKey.trim(),
  };
  if (normalized.llmEndpoint && !/^https?:\/\//i.test(normalized.llmEndpoint)) {
    throw new Error('LLM API 地址必须是以 http:// 或 https:// 开头的完整地址');
  }
  return normalized;
}
