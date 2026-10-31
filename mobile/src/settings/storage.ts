import {activeLlmConnection,selectLlmConnection} from './llmConnections';
import { settingsEvents } from './events';
import { VIDEO_DECODE_MODE_KEY, normalizeVideoDecodeMode, publishVideoDecodeMode, type VideoDecodeMode } from './videoDecodeMode';
import * as SecureStore from 'expo-secure-store';
import type { ReasoningEffort } from '../config/llmReasoning';
import { DEFAULT_LLM_ADVANCED_SETTINGS } from '../config/llmDefaults';

const keys = {
  llmEndpoint: 'llm.endpoint',
  llmModel: 'llm.model',
  llmApiKey: 'llm.apiKey',
  llmTimeoutSeconds: 'llm.timeoutSeconds',
  llmMaxRetries: 'llm.maxRetries',
  autoExportToGallery: 'media.autoExportToGallery',
  keepPrivateCopy: 'media.keepPrivateCopy',
  llmContextWindowTokens: 'llm.contextWindowTokens',
  llmMaxOutputTokens: 'llm.maxOutputTokens',
  llmReasoningEffort: 'llm.reasoningEffort',
  videoDecodeMode: VIDEO_DECODE_MODE_KEY,
  autoExportImagesToGallery: 'media.autoExportImagesToGallery',
} as const;

export type AppSettings = {
  llmConnectionId?:string;llmConnectionRevision?:number;llmSupportsImages?:boolean;
  videoDecodeMode?: VideoDecodeMode;
  autoExportImagesToGallery?: boolean;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmTimeoutSeconds: string;
  llmMaxRetries: string;
  autoExportToGallery: boolean;
  keepPrivateCopy: boolean;
  llmContextWindowTokens?: string;
  llmMaxOutputTokens?: string;
  llmReasoningEffort?: ReasoningEffort;
};

export async function readSettings(): Promise<AppSettings> {
  const [llmEndpoint, llmModel, llmApiKey, llmTimeoutSeconds, llmMaxRetries, autoExportToGallery, keepPrivateCopy, llmContextWindowTokens, llmMaxOutputTokens, llmReasoningEffort, videoDecodeMode, autoExportImagesToGallery] = await Promise.all(
    Object.values(keys).map((key) => SecureStore.getItemAsync(key)),
  );
  const connection=await activeLlmConnection();
  return {
    autoExportImagesToGallery: autoExportImagesToGallery === 'true',
    videoDecodeMode: normalizeVideoDecodeMode(videoDecodeMode),
    llmEndpoint: llmEndpoint || 'https://api.openai.com/v1',
    llmModel: llmModel || 'gpt-4o-mini',
    llmApiKey: llmApiKey ?? '',
    llmTimeoutSeconds: llmTimeoutSeconds || DEFAULT_LLM_ADVANCED_SETTINGS.llmTimeoutSeconds,
    llmMaxRetries: llmMaxRetries || DEFAULT_LLM_ADVANCED_SETTINGS.llmMaxRetries,
    autoExportToGallery: autoExportToGallery !== 'false',
    keepPrivateCopy: keepPrivateCopy !== 'false',
    ...(llmContextWindowTokens ? { llmContextWindowTokens } : {}),
    ...(llmMaxOutputTokens ? { llmMaxOutputTokens } : {}),
    ...(llmReasoningEffort ? { llmReasoningEffort: llmReasoningEffort as ReasoningEffort } : {}),
    ...(connection?{llmEndpoint:connection.endpoint,llmModel:connection.model,llmApiKey:connection.apiKey,llmSupportsImages:connection.images,llmConnectionId:connection.id,llmConnectionRevision:connection.revision,llmReasoningEffort:'default' as const}:{}),
  };
}

export async function saveSettings(values: Partial<AppSettings>): Promise<void> {
  if(values.llmEndpoint!==undefined||values.llmModel!==undefined||values.llmApiKey!==undefined)await selectLlmConnection(null);
  await Promise.all([
    values.autoExportImagesToGallery === undefined ? undefined : SecureStore.setItemAsync(keys.autoExportImagesToGallery, String(values.autoExportImagesToGallery)),
    values.videoDecodeMode === undefined ? undefined : SecureStore.setItemAsync(VIDEO_DECODE_MODE_KEY, normalizeVideoDecodeMode(values.videoDecodeMode)),
    values.llmEndpoint === undefined ? undefined : SecureStore.setItemAsync(keys.llmEndpoint, values.llmEndpoint),
    values.llmModel === undefined ? undefined : SecureStore.setItemAsync(keys.llmModel, values.llmModel),
    values.llmApiKey === undefined ? undefined : SecureStore.setItemAsync(keys.llmApiKey, values.llmApiKey),
    values.llmTimeoutSeconds === undefined ? undefined : SecureStore.setItemAsync(keys.llmTimeoutSeconds, values.llmTimeoutSeconds),
    values.llmMaxRetries === undefined ? undefined : SecureStore.setItemAsync(keys.llmMaxRetries, values.llmMaxRetries),
    values.autoExportToGallery === undefined ? undefined : SecureStore.setItemAsync(keys.autoExportToGallery, String(values.autoExportToGallery)),
    values.keepPrivateCopy === undefined ? undefined : SecureStore.setItemAsync(keys.keepPrivateCopy, String(values.keepPrivateCopy)),
    values.llmContextWindowTokens === undefined ? undefined : SecureStore.setItemAsync(keys.llmContextWindowTokens, values.llmContextWindowTokens),
    values.llmMaxOutputTokens === undefined ? undefined : SecureStore.setItemAsync(keys.llmMaxOutputTokens, values.llmMaxOutputTokens),
    values.llmReasoningEffort === undefined ? undefined : SecureStore.setItemAsync(keys.llmReasoningEffort, values.llmReasoningEffort),
  ].filter((value): value is Promise<void> => Boolean(value)));
  if (values.videoDecodeMode !== undefined) publishVideoDecodeMode(normalizeVideoDecodeMode(values.videoDecodeMode));
  settingsEvents.publish();
}
