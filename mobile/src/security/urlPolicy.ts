export type UrlPolicy = { allowedHosts?: string[]; allowInsecureLocalhost?: boolean };

function isIpv4(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isNonPublicIpv4(host: string): boolean {
  if (!isIpv4(host)) return false;
  const octets = host.split('.').map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b, c] = octets;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
}

function parseIpv6(host: string): number[] | undefined {
  let value = host.toLowerCase().replace(/^\[|\]$/g, '');
  const dotted = value.match(/(?:\d{1,3}\.){3}\d{1,3}$/)?.[0];
  if (dotted) {
    if (!isIpv4(dotted) || dotted.split('.').map(Number).some((part) => part > 255)) return undefined;
    const bytes = dotted.split('.').map(Number);
    value = `${value.slice(0, -dotted.length)}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return undefined;
  return [...left.map((part) => parseInt(part, 16)), ...Array(missing).fill(0), ...right.map((part) => parseInt(part, 16))];
}

function isNonPublicIpv6(host: string): boolean {
  const words = parseIpv6(host);
  if (!words) return false;
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (ipv4Compatible || ipv4Mapped) {
    const ipv4 = `${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
    return isNonPublicIpv4(ipv4);
  }
  const globallyRoutable = words[0] >= 0x2000 && words[0] <= 0x3fff;
  const documentationRange = words[0] === 0x2001 && words[1] === 0x0db8;
  return !globallyRoutable || documentationRange;
}

function isLocalHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local') ||
    isNonPublicIpv4(value) || isNonPublicIpv6(value);
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
