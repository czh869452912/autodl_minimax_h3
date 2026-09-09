import { normalizeArtifactDownloadPolicy } from './downloadPolicy';
import { ProviderError } from './errors';
import { classifyProviderFailure } from '../executor/errorPolicy';

test('normalizes limits once, preserves explicit restrictions and legacy timeout precedence', () => {
  expect(normalizeArtifactDownloadPolicy()).toMatchObject({ allowedHosts: [], allowProviderSuppliedPublicHosts: false, maxBytes: 2 * 1024 ** 3, acceptedMimes: ['video/mp4'], connectTimeoutMs: 30000, idleTimeoutMs: 30000 });
  const policy = { allowedHosts: ['example.test'], acceptedMimes: [], timeoutMs: 800, connectTimeoutMs: 400, maxBytes: 2 };
  expect(normalizeArtifactDownloadPolicy(policy)).toEqual({ allowedHosts: ['example.test'], acceptedMimes: [], allowProviderSuppliedPublicHosts: false, connectTimeoutMs: 400, idleTimeoutMs: 800, maxBytes: 2 });
  expect(normalizeArtifactDownloadPolicy(normalizeArtifactDownloadPolicy(policy))).toEqual(normalizeArtifactDownloadPolicy(policy));
});

test.each([0, -1, NaN, Infinity])('invalid limits are rejected before network work: %s', maxBytes => {
  expect(() => normalizeArtifactDownloadPolicy({ maxBytes })).toThrow('Invalid artifact download limits');
});

test('a second provider gets deterministic auth classification without importing AutoDL', () => {
  expect(classifyProviderFailure('SUBMIT', new ProviderError('second', 'submit', 'auth', 'secret', 401))).toMatchObject({ disposition: 'TERMINAL', error: { code: 'SECOND_SUBMIT_AUTH_401' } });
  expect(classifyProviderFailure('SUBMIT', new ProviderError('second', 'submit', 'timeout', 'secret'))).toMatchObject({ disposition: 'UNKNOWN' });
});
