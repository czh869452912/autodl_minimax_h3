import type { AppSettings } from './storage';
import { assertSafeHttpsUrl } from '../security/urlPolicy';
import { getH3ContextBudget } from '../agent/agentTypes';

export function prepareSettingsForSave(values: AppSettings, options: { allowInsecureLocalhost?: boolean } = {}): AppSettings {
  const normalized = {
    token: values.token.trim(),
    llmEndpoint: values.llmEndpoint.trim().replace(/\/$/, ''),
    llmModel: values.llmModel.trim(),
    llmApiKey: values.llmApiKey.trim(),
    llmTimeoutSeconds: values.llmTimeoutSeconds.trim(),
    llmMaxRetries: values.llmMaxRetries.trim(),
    autoExportToGallery: values.autoExportToGallery,
    keepPrivateCopy: values.keepPrivateCopy,
    ...(values.llmContextWindowTokens !== undefined ? { llmContextWindowTokens: values.llmContextWindowTokens.trim() } : {}),
    ...(values.llmMaxOutputTokens !== undefined ? { llmMaxOutputTokens: values.llmMaxOutputTokens.trim() } : {}),
  };
  if (normalized.llmEndpoint) {
    try {
      normalized.llmEndpoint = assertSafeHttpsUrl(normalized.llmEndpoint, options).replace(/\/$/, '');
    } catch {
      throw new Error(options.allowInsecureLocalhost ? 'LLM API 地址必须使用安全的公网 HTTPS 地址或 debug localhost' : 'LLM API 地址必须使用安全的公网 HTTPS 地址');
    }
  }
  const timeout = Number(normalized.llmTimeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 30 || timeout > 3600)
    throw new Error('LLM 请求超时必须是 30–3600 秒之间的整数');
  const retries = Number(normalized.llmMaxRetries);
  if (!Number.isInteger(retries) || retries < 0 || retries > 5)
    throw new Error('LLM 最大重试次数必须是 0–5 之间的整数');
  try { getH3ContextBudget({ contextWindowTokens: Number(normalized.llmContextWindowTokens ?? 32768), maxOutputTokens: Number(normalized.llmMaxOutputTokens ?? 4096) }); }
  catch { throw new Error('上下文预算至少 8192，输出预算至少 256 且不超过上下文的一半'); }
  return normalized;
}
