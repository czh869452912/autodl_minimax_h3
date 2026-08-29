import * as SecureStore from 'expo-secure-store';

const keys = {
  token: 'autodl.token',
  llmEndpoint: 'llm.endpoint',
  llmModel: 'llm.model',
  llmApiKey: 'llm.apiKey',
  llmTimeoutSeconds: 'llm.timeoutSeconds',
  llmMaxRetries: 'llm.maxRetries',
} as const;

export type AppSettings = {
  token: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
  llmTimeoutSeconds: string;
  llmMaxRetries: string;
};

export async function readSettings(): Promise<AppSettings> {
  const [token, llmEndpoint, llmModel, llmApiKey, llmTimeoutSeconds, llmMaxRetries] = await Promise.all(
    Object.values(keys).map((key) => SecureStore.getItemAsync(key)),
  );
  return {
    token: token ?? '',
    llmEndpoint: llmEndpoint || 'https://api.openai.com/v1',
    llmModel: llmModel || 'gpt-4o-mini',
    llmApiKey: llmApiKey ?? '',
    llmTimeoutSeconds: llmTimeoutSeconds || '600',
    llmMaxRetries: llmMaxRetries || '2',
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
  ].filter((value): value is Promise<void> => Boolean(value)));
}
