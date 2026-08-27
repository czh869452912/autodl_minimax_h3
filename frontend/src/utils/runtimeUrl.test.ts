import { describe, expect, it } from 'vitest';
import { DEFAULT_NATIVE_RUNTIME_URL, resolveCopilotRuntimeUrl } from './runtimeUrl';

describe('resolveCopilotRuntimeUrl', () => {
  it('uses an explicit runtime URL when configured', () => {
    expect(resolveCopilotRuntimeUrl({ isNative: true, storedUrl: 'http://192.168.1.20:8787/api/copilotkit' }))
      .toBe('http://192.168.1.20:8787/api/copilotkit');
  });

  it('uses the Android emulator host when running in the native app without configuration', () => {
    expect(resolveCopilotRuntimeUrl({ isNative: true, storedUrl: '' })).toBe(DEFAULT_NATIVE_RUNTIME_URL);
  });

  it('keeps the relative URL for the browser development proxy', () => {
    expect(resolveCopilotRuntimeUrl({ isNative: false, storedUrl: '' })).toBe('/api/copilotkit');
  });
});
