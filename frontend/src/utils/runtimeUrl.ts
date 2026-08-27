export const DEFAULT_BROWSER_RUNTIME_URL = '/api/copilotkit';
export const DEFAULT_NATIVE_RUNTIME_URL = 'http://10.0.2.2:8787/api/copilotkit';

interface RuntimeUrlOptions {
  isNative: boolean;
  storedUrl?: string;
}

export function resolveCopilotRuntimeUrl({ isNative, storedUrl }: RuntimeUrlOptions): string {
  const configuredUrl = storedUrl?.trim();
  if (configuredUrl) return configuredUrl;
  return isNative ? DEFAULT_NATIVE_RUNTIME_URL : DEFAULT_BROWSER_RUNTIME_URL;
}
