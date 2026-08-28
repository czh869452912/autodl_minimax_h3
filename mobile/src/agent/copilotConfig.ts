export type CopilotRuntimeTarget = 'android-emulator' | 'custom';

const COPILOT_PATH = '/api/copilotkit';

/**
 * Builds the single runtime endpoint used by the rendered CopilotKit chat.
 * Android's emulator cannot reach the host through 127.0.0.1, so local
 * development uses the documented 10.0.2.2 host alias.
 */
export function getCopilotRuntimeUrl(target: CopilotRuntimeTarget, configuredUrl: string): string {
  const raw = configuredUrl.trim();
  if (!raw) throw new Error('Agent runtime URL is required');

  const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
  if (target === 'android-emulator' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) {
    url.hostname = '10.0.2.2';
  }

  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/') url.pathname = COPILOT_PATH;
  else if (path.endsWith(COPILOT_PATH)) url.pathname = path;
  else url.pathname = `${path}${COPILOT_PATH}`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function getAgentHeaders(accessToken: string): Record<string, string> {
  const token = accessToken.trim();
  return token
    ? { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    : { Accept: 'application/json' };
}
