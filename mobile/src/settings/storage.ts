import * as SecureStore from 'expo-secure-store';

const keys = {
  token: 'autodl.token',
  llmEndpoint: 'llm.endpoint',
  llmModel: 'llm.model',
  llmApiKey: 'llm.apiKey',
} as const;

export type AppSettings = {
  token: string;
  llmEndpoint: string;
  llmModel: string;
  llmApiKey: string;
};

export async function readSettings(): Promise<AppSettings> {
  const [token, llmEndpoint, llmModel, llmApiKey] = await Promise.all(
    Object.values(keys).map((key) => SecureStore.getItemAsync(key)),
  );
  return {
    token: token ?? '',
    llmEndpoint: llmEndpoint || 'https://api.openai.com/v1',
    llmModel: llmModel || 'gpt-4o-mini',
    llmApiKey: llmApiKey ?? '',
  };
}

export async function saveSettings(values: Partial<AppSettings>): Promise<void> {
  await Promise.all([
    values.token === undefined ? undefined : SecureStore.setItemAsync(keys.token, values.token),
    values.llmEndpoint === undefined ? undefined : SecureStore.setItemAsync(keys.llmEndpoint, values.llmEndpoint),
    values.llmModel === undefined ? undefined : SecureStore.setItemAsync(keys.llmModel, values.llmModel),
    values.llmApiKey === undefined ? undefined : SecureStore.setItemAsync(keys.llmApiKey, values.llmApiKey),
  ].filter((value): value is Promise<void> => Boolean(value)));
}
