import { prepareSettingsForSave } from './validation';

describe('settings validation before secure persistence', () => {
  it('rejects a model identifier entered in the API address field', () => {
    expect(() => prepareSettingsForSave({
      token: '',
      llmEndpoint: 'deepseek-v4-flash-vision-exp',
      llmModel: 'deepseek-v4-flash',
      llmApiKey: 'test-key',
      llmTimeoutSeconds: '600',
      llmMaxRetries: '2',
    })).toThrow('LLM API 地址必须是以 http:// 或 https:// 开头的完整地址');
  });

  it('normalizes a valid OpenAI-compatible configuration', () => {
    expect(prepareSettingsForSave({
      token: ' token ',
      llmEndpoint: ' https://api.deepseek.com/ ',
      llmModel: ' deepseek-v4-flash-vision-exp ',
      llmApiKey: ' test-key ',
      llmTimeoutSeconds: ' 900 ',
      llmMaxRetries: ' 3 ',
    })).toEqual({
      token: 'token',
      llmEndpoint: 'https://api.deepseek.com',
      llmModel: 'deepseek-v4-flash-vision-exp',
      llmApiKey: 'test-key',
      llmTimeoutSeconds: '900',
      llmMaxRetries: '3',
    });
  });

  it.each([
    ['29', '2', 'LLM 请求超时必须是 30–3600 秒之间的整数'],
    ['600.5', '2', 'LLM 请求超时必须是 30–3600 秒之间的整数'],
    ['600', '6', 'LLM 最大重试次数必须是 0–5 之间的整数'],
    ['600', '-1', 'LLM 最大重试次数必须是 0–5 之间的整数'],
  ])('rejects invalid network controls (%s, %s)', (timeout, retries, message) => {
    expect(() => prepareSettingsForSave({
      token: '',
      llmEndpoint: 'https://api.example.test/v1',
      llmModel: 'model',
      llmApiKey: 'key',
      llmTimeoutSeconds: timeout,
      llmMaxRetries: retries,
    })).toThrow(message);
  });
});
