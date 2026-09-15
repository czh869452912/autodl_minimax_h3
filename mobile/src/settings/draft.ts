import * as SecureStore from 'expo-secure-store';
import type { AppSettings } from './storage';
const KEY = 'settings.pendingDraft';
let tail: Promise<void> = Promise.resolve();
export async function readSettingsDraft(): Promise<Partial<AppSettings> | undefined> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('设置草稿无法读取');
  const allowedStrings = new Set(['token', 'llmEndpoint', 'llmModel', 'llmApiKey', 'llmTimeoutSeconds', 'llmMaxRetries', 'llmContextWindowTokens', 'llmMaxOutputTokens', 'llmReasoningEffort', 'videoDecodeMode']);
  const allowedBooleans = new Set(['autoExportToGallery', 'keepPrivateCopy']);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(allowedStrings.has(key) && typeof value === 'string') && !(allowedBooleans.has(key) && typeof value === 'boolean')) throw new Error('设置草稿格式无效');
  }
  return parsed;
}
export function writeSettingsDraft(values?: AppSettings): Promise<void> {
  const payload = values ? JSON.stringify(values) : '';
  const next = tail.catch(() => undefined).then(() => SecureStore.setItemAsync(KEY, payload));
  tail = next;
  return next;
}
