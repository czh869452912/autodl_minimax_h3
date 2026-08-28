import * as SecureStore from 'expo-secure-store';

const keys = { token: 'autodl.token', agentUrl: 'agent.runtimeUrl', agentAccessToken: 'agent.accessToken' } as const;

export async function readSettings() {
  const [token, agentUrl, agentAccessToken] = await Promise.all(Object.values(keys).map((key) => SecureStore.getItemAsync(key)));
  return {
    token: token ?? '',
    agentUrl: agentUrl || 'http://10.0.2.2:8200',
    agentAccessToken: agentAccessToken ?? '',
  };
}

export async function saveSettings(values: Partial<{ token: string; agentUrl: string; agentAccessToken: string }>) {
  await Promise.all([
    values.token === undefined ? undefined : SecureStore.setItemAsync(keys.token, values.token),
    values.agentUrl === undefined ? undefined : SecureStore.setItemAsync(keys.agentUrl, values.agentUrl),
    values.agentAccessToken === undefined ? undefined : SecureStore.setItemAsync(keys.agentAccessToken, values.agentAccessToken),
  ].filter(Boolean));
}
