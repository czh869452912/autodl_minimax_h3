export type UrlPolicy = { allowedHosts?: string[]; allowInsecureLocalhost?: boolean };

function isIpv4(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isPrivateIpv4(host: string): boolean {
  if (!isIpv4(host)) return false;
  const octets = host.split('.').map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
}

function isLocalHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local') ||
    value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || isPrivateIpv4(value);
}

function isAllowedHost(host: string, entries: string[]): boolean {
  const value = host.toLowerCase();
  return entries.some((entry) => {
    const normalized = entry.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    return normalized.length > 0 && (value === normalized || value.endsWith(`.${normalized}`));
  });
}

export function assertSafeHttpsUrl(raw: string, policy: UrlPolicy = {}): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL 格式无效'); }
  const localDebug = Boolean(policy.allowInsecureLocalhost && isLocalHost(url.hostname) && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'));
  if (url.protocol !== 'https:' && !(localDebug && url.protocol === 'http:')) throw new Error('必须使用 HTTPS');
  if (url.username || url.password) throw new Error('URL 不能包含凭据');
  if (isLocalHost(url.hostname) && !localDebug) throw new Error('不允许访问本机或私有网络地址');
  if (policy.allowedHosts?.length && !isAllowedHost(url.hostname, policy.allowedHosts)) throw new Error('域名不在允许列表');
  return url.toString();
}
