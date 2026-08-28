import * as SecureStore from 'expo-secure-store';

const keys = { token: 'autodl.token', apiKey: 'agent.apiKey', endpoint: 'agent.endpoint', model: 'agent.model' } as const;

export async function readSettings() {
  const [token, apiKey, endpoint, model] = await Promise.all(Object.values(keys).map((key) => SecureStore.getItemAsync(key)));
  return { token: token ?? '', apiKey: apiKey ?? '', endpoint: endpoint || 'https://api.minimaxi.com/v1', model: model || 'MiniMax-M2.7' };
}

export async function saveSettings(values: Partial<{ token: string; apiKey: string; endpoint: string; model: string }>) {
  await Promise.all([
    values.token === undefined ? undefined : SecureStore.setItemAsync(keys.token, values.token),
    values.apiKey === undefined ? undefined : SecureStore.setItemAsync(keys.apiKey, values.apiKey),
    values.endpoint === undefined ? undefined : SecureStore.setItemAsync(keys.endpoint, values.endpoint),
    values.model === undefined ? undefined : SecureStore.setItemAsync(keys.model, values.model),
  ].filter(Boolean));
}
