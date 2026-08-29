import * as SecureStore from 'expo-secure-store';
import { readSettings, saveSettings } from './storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

describe('local LLM settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads only app token and LLM configuration, with no agent runtime fields', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('autodl-token')
      .mockResolvedValueOnce('https://api.example.test/v1')
      .mockResolvedValueOnce('h3-model')
      .mockResolvedValueOnce('llm-key');

    await expect(readSettings()).resolves.toEqual({
      token: 'autodl-token',
      llmEndpoint: 'https://api.example.test/v1',
      llmModel: 'h3-model',
      llmApiKey: 'llm-key',
    });
  });

  it('persists LLM configuration through secure storage', async () => {
    await saveSettings({ llmEndpoint: 'https://api.example.test/v1', llmModel: 'h3-model', llmApiKey: 'secret' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.endpoint', 'https://api.example.test/v1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.model', 'h3-model');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.apiKey', 'secret');
  });
});
