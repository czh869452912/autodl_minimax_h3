import { assertSafeHttpsUrl } from './urlPolicy';

test.each([
  'http://api.example.test/v1',
  'https://localhost/v1',
  'https://127.0.0.1/v1',
  'https://10.0.0.8/v1',
  'https://172.16.0.8/v1',
  'https://192.168.1.8/v1',
  'https://169.254.1.1/v1',
  'https://[::1]/v1',
  'https://[::]/v1',
  'https://[::ffff:127.0.0.1]/v1',
  'https://[::ffff:7f00:1]/v1',
  'https://[fe90::1]/v1',
  'https://[ff02::1]/v1',
  'https://user:password@example.test/v1',
])('rejects unsafe production URL %s', (value) => {
  expect(() => assertSafeHttpsUrl(value)).toThrow();
});

test('accepts a public HTTPS endpoint and enforces an optional host allowlist', () => {
  expect(assertSafeHttpsUrl('https://api.example.test/v1')).toBe('https://api.example.test/v1');
  expect(() => assertSafeHttpsUrl('https://cdn.other.test/file', { allowedHosts: ['example.test'] })).toThrow('域名不在允许列表');
  expect(assertSafeHttpsUrl('https://cdn.example.test/file', { allowedHosts: ['example.test'] })).toBe('https://cdn.example.test/file');
  expect(assertSafeHttpsUrl('https://[2606:4700:4700::1111]/v1')).toBe('https://[2606:4700:4700::1111]/v1');
});

test('allows loopback HTTP only when explicitly enabled for debug tooling', () => {
  expect(assertSafeHttpsUrl('http://localhost:11434/v1', { allowInsecureLocalhost: true })).toBe('http://localhost:11434/v1');
  expect(() => assertSafeHttpsUrl('http://192.168.1.8/v1', { allowInsecureLocalhost: true })).toThrow();
});

test.each([
  ['not-a-url', 'URL_INVALID'],
  ['http://api.example.test/v1', 'HTTPS_REQUIRED'],
  ['https://user:password@example.test/v1', 'URL_CREDENTIALS'],
  ['https://127.0.0.1/v1', 'PRIVATE_NETWORK'],
] as const)('exposes a stable policy code for %s', (value, code) => {
  try {
    assertSafeHttpsUrl(value);
    throw new Error('expected URL policy rejection');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
});

test('exposes a stable host-denied code', () => {
  try {
    assertSafeHttpsUrl('https://other.example/file', { allowedHosts: ['cdn.example'] });
    throw new Error('expected host rejection');
  } catch (error) {
    expect(error).toMatchObject({ code: 'HOST_DENIED' });
  }
});
