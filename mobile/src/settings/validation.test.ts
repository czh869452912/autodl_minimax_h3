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
      autoExportToGallery: true,
      keepPrivateCopy: true,
    })).toThrow('LLM API 地址必须使用安全的公网 HTTPS 地址');
  });

  it('normalizes a valid OpenAI-compatible configuration', () => {
    expect(prepareSettingsForSave({
      token: ' token ',
      llmEndpoint: ' https://api.deepseek.com/ ',
      llmModel: ' deepseek-v4-flash-vision-exp ',
      llmApiKey: ' test-key ',
      llmTimeoutSeconds: ' 900 ',
      llmMaxRetries: ' 3 ',
      autoExportToGallery: false,
      keepPrivateCopy: true,
    })).toEqual({
      token: 'token',
      llmEndpoint: 'https://api.deepseek.com',
      llmModel: 'deepseek-v4-flash-vision-exp',
      llmApiKey: 'test-key',
      llmTimeoutSeconds: '900',
      llmMaxRetries: '3',
      autoExportToGallery: false,
      keepPrivateCopy: true,
    });
  });

  it('rejects cleartext and local-network LLM endpoints in production', () => {
    const validSettings = {
      token: '', llmModel: 'model', llmApiKey: 'key', llmTimeoutSeconds: '600', llmMaxRetries: '2',
      autoExportToGallery: true, keepPrivateCopy: true,
    };
    for (const llmEndpoint of ['http://api.example.test/v1', 'https://localhost/v1', 'https://192.168.1.2/v1']) {
      expect(() => prepareSettingsForSave({ ...validSettings, llmEndpoint })).toThrow('LLM API 地址必须使用安全的公网 HTTPS 地址');
    }
  });

  it('allows a localhost exception only for debug tooling', () => {
    const value = prepareSettingsForSave({
      token: '', llmEndpoint: 'http://localhost:11434/v1', llmModel: 'model', llmApiKey: 'key',
      llmTimeoutSeconds: '600', llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true,
    }, { allowInsecureLocalhost: true });
    expect(value.llmEndpoint).toBe('http://localhost:11434/v1');
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
      autoExportToGallery: true,
      keepPrivateCopy: true,
    })).toThrow(message);
  });
});

const advancedSettings = {
  token: '', llmEndpoint: 'https://api.deepseek.com', llmModel: 'deepseek-v4-flash', llmApiKey: 'key',
  llmTimeoutSeconds: '600', llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true,
};
it('rejects a saved unsupported OpenAI effort and preserves a supported none value', () => {
  expect(() => prepareSettingsForSave({ ...advancedSettings, llmModel: 'gpt-5', llmReasoningEffort: 'none' })).toThrow(/思考强度/);
  expect(prepareSettingsForSave({ ...advancedSettings, llmModel: 'gpt-5.1', llmReasoningEffort: 'none' }).llmReasoningEffort).toBe('none');
});
it('restores explicit defaults when advanced numeric fields are blank', () => {
  expect(prepareSettingsForSave({ ...advancedSettings, llmTimeoutSeconds: ' ', llmMaxRetries: '', llmContextWindowTokens: '', llmMaxOutputTokens: ' ' })).toMatchObject({
    llmTimeoutSeconds: '600', llmMaxRetries: '2', llmContextWindowTokens: '32768', llmMaxOutputTokens: '4096',
  });
});
it.each(['low', 'high', 'max', 'none', 'default'] as const)('accepts DeepSeek thinking effort %s', llmReasoningEffort => {
  expect(prepareSettingsForSave({ ...advancedSettings, llmReasoningEffort }).llmReasoningEffort).toBe(llmReasoningEffort);
});
it.each(['medium', 'xhigh', 'bogus'])('rejects unsupported DeepSeek thinking effort %s', llmReasoningEffort => {
  expect(() => prepareSettingsForSave({ ...advancedSettings, llmReasoningEffort } as any)).toThrow(/思考强度/);
});
it.each(['-1', '3.5', '1e4', '0x1000'])('rejects invalid numeric output budget %s', llmMaxOutputTokens => {
  expect(() => prepareSettingsForSave({ ...advancedSettings, llmMaxOutputTokens })).toThrow();
});
