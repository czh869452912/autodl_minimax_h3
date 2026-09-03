import { ProviderError } from '../providers/autodl/client';
import { classifyProviderFailure } from './errorPolicy';

test.each([
  [new ProviderError('autodl', 'submit', 'auth', 'secret', 401), 'TERMINAL'],
  [new ProviderError('autodl', 'submit', 'http', 'bad input', 422), 'TERMINAL'],
  [new ProviderError('autodl', 'submit', 'timeout', 'timeout'), 'UNKNOWN'],
  [new ProviderError('autodl', 'submit', 'network', 'offline'), 'UNKNOWN'],
  [new ProviderError('autodl', 'submit', 'http', 'upstream', 503), 'UNKNOWN'],
] as const)('classifies submit failure as expected', (error, expected) => {
  expect(classifyProviderFailure('SUBMIT', error).disposition).toBe(expected);
});

test.each([
  [new ProviderError('autodl', 'status', 'auth', 'secret', 401), 'TERMINAL'],
  [new ProviderError('autodl', 'status', 'http', 'missing', 404), 'TERMINAL'],
  [new ProviderError('autodl', 'status', 'timeout', 'timeout'), 'RETRYABLE'],
  [new ProviderError('autodl', 'status', 'network', 'offline'), 'RETRYABLE'],
  [new ProviderError('autodl', 'status', 'http', 'upstream', 503), 'RETRYABLE'],
] as const)('classifies status failure as expected', (error, expected) => {
  expect(classifyProviderFailure('STATUS_SYNC', error).disposition).toBe(expected);
});

test('normalizes errors without retaining secrets, payloads, or URL query strings', () => {
  const error = new ProviderError(
    'autodl',
    'status',
    'network',
    'Authorization: Bearer top-secret token=abc payload={"prompt":"private"} https://api.example/status?signature=secret',
  );
  const result = classifyProviderFailure('STATUS_SYNC', error);
  expect(result.error).toEqual({
    code: 'AUTODL_STATUS_NETWORK',
    message: 'Provider status request failed.',
    retryable: true,
  });
  expect(JSON.stringify(result)).not.toMatch(/top-secret|abc|private|signature/i);
});

test('normalizes unknown thrown values to a stable diagnostic', () => {
  expect(classifyProviderFailure('SUBMIT', { token: 'secret', payload: { prompt: 'private' } })).toEqual({
    disposition: 'UNKNOWN',
    error: { code: 'PROVIDER_SUBMIT_UNKNOWN', message: 'Provider submit request outcome is unknown.' },
  });
});
