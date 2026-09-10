import type { AppSettings } from './storage';
import { assertSafeHttpsUrl } from '../security/urlPolicy';
import { DEFAULT_LLM_ADVANCED_SETTINGS as defaults } from '../config/llmDefaults';
import { validateReasoningEffort } from '../config/llmReasoning';
import { getH3ContextBudget } from '../config/llmBudget';

export function prepareSettingsForSave(values: AppSettings, options: { allowInsecureLocalhost?: boolean } = {}): AppSettings {
  const normalized = {
    ...(values.videoDecodeMode !== undefined ? { videoDecodeMode: values.videoDecodeMode } : {}),
    token: values.token.trim(),
    llmEndpoint: values.llmEndpoint.trim().replace(/\/$/, ''),
    llmModel: values.llmModel.trim(),
    llmApiKey: values.llmApiKey.trim(),
    llmTimeoutSeconds: values.llmTimeoutSeconds.trim() || defaults.llmTimeoutSeconds,
    llmMaxRetries: values.llmMaxRetries.trim() || defaults.llmMaxRetries,
    autoExportToGallery: values.autoExportToGallery,
    keepPrivateCopy: values.keepPrivateCopy,
    ...(values.llmContextWindowTokens !== undefined ? { llmContextWindowTokens: values.llmContextWindowTokens.trim() || defaults.llmContextWindowTokens } : {}),
    ...(values.llmMaxOutputTokens !== undefined ? { llmMaxOutputTokens: values.llmMaxOutputTokens.trim() || defaults.llmMaxOutputTokens } : {}),
    ...(values.llmReasoningEffort !== undefined ? { llmReasoningEffort: values.llmReasoningEffort } : {}),
  };
  validateReasoningEffort(normalized.llmModel, normalized.llmReasoningEffort);
  for (const value of [normalized.llmContextWindowTokens, normalized.llmMaxOutputTokens]) {
    if (value !== undefined && !/^\d+$/.test(value)) throw new Error('LLM 数值设置必须为非负十进制整数');
  }
  if (normalized.llmEndpoint) {
    try {
      normalized.llmEndpoint = assertSafeHttpsUrl(normalized.llmEndpoint, options).replace(/\/$/, '');
    } catch {
      throw new Error(options.allowInsecureLocalhost ? 'LLM API 地址必须使用安全的公网 HTTPS 地址或 debug localhost' : 'LLM API 地址必须使用安全的公网 HTTPS 地址');
    }
  }
  const timeout = Number(normalized.llmTimeoutSeconds);
  if (!/^\d+$/.test(normalized.llmTimeoutSeconds) || !Number.isInteger(timeout) || timeout < 30 || timeout > 3600)
    throw new Error('LLM 请求超时必须是 30–3600 秒之间的整数');
  const retries = Number(normalized.llmMaxRetries);
  if (!/^\d+$/.test(normalized.llmMaxRetries) || !Number.isInteger(retries) || retries < 0 || retries > 5)
    throw new Error('LLM 最大重试次数必须是 0–5 之间的整数');
  try { getH3ContextBudget({ contextWindowTokens: Number(normalized.llmContextWindowTokens ?? defaults.llmContextWindowTokens), maxOutputTokens: Number(normalized.llmMaxOutputTokens ?? defaults.llmMaxOutputTokens) }); }
  catch { throw new Error('上下文预算至少 8192，输出预算至少 256 且不超过上下文的一半'); }
  return normalized;
}
