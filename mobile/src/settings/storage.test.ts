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
      .mockResolvedValueOnce('llm-key')
      .mockResolvedValueOnce('900')
      .mockResolvedValueOnce('4');

    await expect(readSettings()).resolves.toEqual({
      token: 'autodl-token',
      llmEndpoint: 'https://api.example.test/v1',
      llmModel: 'h3-model',
      llmApiKey: 'llm-key',
      llmTimeoutSeconds: '900',
      llmMaxRetries: '4',
      autoExportToGallery: true,
      keepPrivateCopy: true,
    });
  });

  it('uses safe network defaults for existing installations', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await expect(readSettings()).resolves.toMatchObject({
      llmTimeoutSeconds: '600',
      llmMaxRetries: '2',
      autoExportToGallery: true,
      keepPrivateCopy: true,
    });
  });

  it('persists LLM configuration through secure storage', async () => {
    await saveSettings({ llmEndpoint: 'https://api.example.test/v1', llmModel: 'h3-model', llmApiKey: 'secret', llmTimeoutSeconds: '1200', llmMaxRetries: '3' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.endpoint', 'https://api.example.test/v1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.model', 'h3-model');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.apiKey', 'secret');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.timeoutSeconds', '1200');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('llm.maxRetries', '3');
  });

  it('persists disabled media policy as explicit booleans', async () => {
    await saveSettings({ autoExportToGallery: false, keepPrivateCopy: false });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('media.autoExportToGallery', 'false');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('media.keepPrivateCopy', 'false');
  });
});
