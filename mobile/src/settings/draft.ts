import * as SecureStore from 'expo-secure-store';
import type { AppSettings } from './storage';
const KEY = 'settings.pendingDraft';
let tail: Promise<void> = Promise.resolve();
export async function readSettingsDraft(): Promise<Partial<AppSettings> | undefined> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('设置草稿无法读取');
  const {token: _legacyToken, llmConnectionId:_id,llmConnectionRevision:_revision,llmSupportsImages:_images,...preferences} = parsed;
  const allowedStrings = new Set([ 'llmEndpoint', 'llmModel', 'llmApiKey', 'llmTimeoutSeconds', 'llmMaxRetries', 'llmContextWindowTokens', 'llmMaxOutputTokens', 'llmReasoningEffort', 'videoDecodeMode']);
  const allowedBooleans = new Set(['autoExportToGallery', 'autoExportImagesToGallery', 'keepPrivateCopy']);
  for (const [key, value] of Object.entries(preferences)) {
    if (!(allowedStrings.has(key) && typeof value === 'string') && !(allowedBooleans.has(key) && typeof value === 'boolean')) throw new Error('设置草稿格式无效');
  }
  return preferences;
}
export function writeSettingsDraft(values?: AppSettings): Promise<void> {
  const {token: _legacyToken,llmConnectionId:_id,llmConnectionRevision:_revision,llmSupportsImages:_images, ...preferences} = (values ?? {}) as AppSettings & {token?: unknown};
  if(_id){delete (preferences as Partial<AppSettings>).llmEndpoint;delete (preferences as Partial<AppSettings>).llmModel;delete (preferences as Partial<AppSettings>).llmApiKey;}
  const payload = values ? JSON.stringify(preferences) : '';
  const next = tail.catch(() => undefined).then(() => SecureStore.setItemAsync(KEY, payload));
  tail = next;
  return next;
}
