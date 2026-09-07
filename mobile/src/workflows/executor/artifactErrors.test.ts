import { artifactError } from './artifactErrors';

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
