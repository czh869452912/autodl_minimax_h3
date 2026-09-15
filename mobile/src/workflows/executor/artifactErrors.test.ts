import { artifactError, artifactNetworkMessage, hasArtifactNetworkHelp, ARTIFACT_NETWORK_HELP_CODES } from './artifactErrors';

test('DNS failures use canonical retryability and a safe diagnostic reason', () => {
  const failure = artifactError({ code: 'ARTIFACT_DNS_FAILED', retryable: false,
    message: 'https://secret.example/?token=secret', userInfo: { reason: 'DNS_UNKNOWN_HOST' } });
  expect(failure).toMatchObject({ code: 'ARTIFACT_DNS_FAILED', retryable: true });
  expect(failure.message).toContain('DNS_UNKNOWN_HOST');
  expect(failure.message).not.toContain('secret');
});

test('virtual DNS is actionable and is not automatically retried', () => {
  const failure = artifactError({ code: 'ARTIFACT_VIRTUAL_DNS', retryable: true });
  expect(failure).toMatchObject({ code: 'ARTIFACT_VIRTUAL_DNS', retryable: false });
  expect(failure.message).toContain('Fake-IP');
});

test('unrecognized diagnostic values never reach the stored message', () => {
  const failure = artifactError({ code: 'ARTIFACT_DNS_FAILED', userInfo: { reason: 'secret' } });
  expect(failure.code).toBe('ARTIFACT_DNS_FAILED');
  expect(failure.message).not.toContain('secret');
});

test.each([
  ['ARTIFACT_PRIVATE_NETWORK', false, '私有或保留地址'],
  ['ARTIFACT_NETWORK', true, '下载连接失败或超时'],
  ['ARTIFACT_CONNECT_TIMEOUT', true, '下载连接失败或超时'],
  ['ARTIFACT_IDLE_TIMEOUT', true, '下载连接失败或超时'],
] as const)('%s has actionable copy and canonical retryability', (code, retryable, message) => {
  const error = artifactError({ code, retryable: !retryable, message: 'https://secret/?token=hidden' });
  expect(error.retryable).toBe(retryable);
  expect(error.message).toContain(message);
  expect(error.message).toContain(retryable ? '自动重试' : '手动重试');
  expect(error.message).not.toContain('secret');
});

test.each(ARTIFACT_NETWORK_HELP_CODES)('network help recognizes %s codes and their generated projection text', code => {
  expect(hasArtifactNetworkHelp(code)).toBe(true);
  const message = artifactNetworkMessage(code, 'DNS_TIMEOUT');
  if (message) expect(hasArtifactNetworkHelp(message)).toBe(true);
});

test('network help preserves historical text but excludes unrelated failures', () => {
  expect(hasArtifactNetworkHelp('下载域名解析到疑似 VPN Fake-IP 地址，请将下载域名设为真实 DNS 解析后重试。')).toBe(true);
  expect(hasArtifactNetworkHelp('网络连接失败，请检查网络后重试')).toBe(true);
  expect(hasArtifactNetworkHelp('ARTIFACT_HTTP_RETRYABLE: HTTP 503')).toBe(true);
  expect(hasArtifactNetworkHelp('ARTIFACT_MIME_REJECTED')).toBe(false);
  expect(hasArtifactNetworkHelp('ARTIFACT_SIZE_REJECTED')).toBe(false);
  expect(hasArtifactNetworkHelp()).toBe(false);
});
