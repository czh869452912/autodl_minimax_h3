import type { AppSettings } from './storage';

export function prepareSettingsForSave(values: AppSettings): AppSettings {
  const normalized = {
    token: values.token.trim(),
    llmEndpoint: values.llmEndpoint.trim().replace(/\/$/, ''),
    llmModel: values.llmModel.trim(),
    llmApiKey: values.llmApiKey.trim(),
    llmTimeoutSeconds: values.llmTimeoutSeconds.trim(),
    llmMaxRetries: values.llmMaxRetries.trim(),
    autoExportToGallery: values.autoExportToGallery,
    keepPrivateCopy: values.keepPrivateCopy,
  };
  if (normalized.llmEndpoint && !/^https?:\/\//i.test(normalized.llmEndpoint)) {
    throw new Error('LLM API 地址必须是以 http:// 或 https:// 开头的完整地址');
  }
  const timeout = Number(normalized.llmTimeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 30 || timeout > 3600)
    throw new Error('LLM 请求超时必须是 30–3600 秒之间的整数');
  const retries = Number(normalized.llmMaxRetries);
  if (!Number.isInteger(retries) || retries < 0 || retries > 5)
    throw new Error('LLM 最大重试次数必须是 0–5 之间的整数');
  return normalized;
}
