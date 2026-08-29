import { prepareSettingsForSave } from './validation';

describe('settings validation before secure persistence', () => {
  it('rejects a model identifier entered in the API address field', () => {
    expect(() => prepareSettingsForSave({
      token: '',
      llmEndpoint: 'deepseek-v4-flash-vision-exp',
      llmModel: 'deepseek-v4-flash',
      llmApiKey: 'test-key',
    })).toThrow('LLM API 地址必须是以 http:// 或 https:// 开头的完整地址');
  });

  it('normalizes a valid OpenAI-compatible configuration', () => {
    expect(prepareSettingsForSave({
      token: ' token ',
      llmEndpoint: ' https://api.deepseek.com/ ',
      llmModel: ' deepseek-v4-flash-vision-exp ',
      llmApiKey: ' test-key ',
    })).toEqual({
      token: 'token',
      llmEndpoint: 'https://api.deepseek.com',
      llmModel: 'deepseek-v4-flash-vision-exp',
      llmApiKey: 'test-key',
    });
  });
});
