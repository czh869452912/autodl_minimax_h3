import * as SecureStore from 'expo-secure-store';

const keys = {
  token: 'autodl.token',
  llmEndpoint: 'llm.endpoint',
  llmModel: 'llm.model',
  llmApiKey: 'llm.apiKey',
  llmTimeoutSeconds: 'llm.timeoutSeconds',
  llmMaxRetries: 'llm.maxRetries',
  autoExportToGallery: 'media.autoExportToGallery',
  keepPrivateCopy: 'media.keepPrivateCopy',
  llmContextWindowTokens: 'llm.contextWindowTokens',
  llmMaxOutputTokens: 'llm.maxOutputTokens',
} as const;

export type AppSettings = {
  token: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmTimeoutSeconds: string;
  llmMaxRetries: string;
  autoExportToGallery: boolean;
  keepPrivateCopy: boolean;
  llmContextWindowTokens?: string;
  llmMaxOutputTokens?: string;
};

export async function readSettings(): Promise<AppSettings> {
  const [token, llmEndpoint, llmModel, llmApiKey, llmTimeoutSeconds, llmMaxRetries, autoExportToGallery, keepPrivateCopy, llmContextWindowTokens, llmMaxOutputTokens] = await Promise.all(
    Object.values(keys).map((key) => SecureStore.getItemAsync(key)),
  );
  return {
    token: token ?? '',
    llmEndpoint: llmEndpoint || 'https://api.openai.com/v1',
    llmModel: llmModel || 'gpt-4o-mini',
    llmApiKey: llmApiKey ?? '',
    llmTimeoutSeconds: llmTimeoutSeconds || '600',
    llmMaxRetries: llmMaxRetries || '2',
    autoExportToGallery: autoExportToGallery !== 'false',
    keepPrivateCopy: keepPrivateCopy !== 'false',
    ...(llmContextWindowTokens ? { llmContextWindowTokens } : {}),
    ...(llmMaxOutputTokens ? { llmMaxOutputTokens } : {}),
  };
}

export async function saveSettings(values: Partial<AppSettings>): Promise<void> {
  await Promise.all([
    values.token === undefined ? undefined : SecureStore.setItemAsync(keys.token, values.token),
    values.llmEndpoint === undefined ? undefined : SecureStore.setItemAsync(keys.llmEndpoint, values.llmEndpoint),
    values.llmModel === undefined ? undefined : SecureStore.setItemAsync(keys.llmModel, values.llmModel),
    values.llmApiKey === undefined ? undefined : SecureStore.setItemAsync(keys.llmApiKey, values.llmApiKey),
    values.llmTimeoutSeconds === undefined ? undefined : SecureStore.setItemAsync(keys.llmTimeoutSeconds, values.llmTimeoutSeconds),
    values.llmMaxRetries === undefined ? undefined : SecureStore.setItemAsync(keys.llmMaxRetries, values.llmMaxRetries),
    values.autoExportToGallery === undefined ? undefined : SecureStore.setItemAsync(keys.autoExportToGallery, String(values.autoExportToGallery)),
    values.keepPrivateCopy === undefined ? undefined : SecureStore.setItemAsync(keys.keepPrivateCopy, String(values.keepPrivateCopy)),
    values.llmContextWindowTokens === undefined ? undefined : SecureStore.setItemAsync(keys.llmContextWindowTokens, values.llmContextWindowTokens),
    values.llmMaxOutputTokens === undefined ? undefined : SecureStore.setItemAsync(keys.llmMaxOutputTokens, values.llmMaxOutputTokens),
  ].filter((value): value is Promise<void> => Boolean(value)));
}
