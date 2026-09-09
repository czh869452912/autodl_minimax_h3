import { classifyMediaValidationFailure, mediaValidationMessage } from './mediaValidation';

test.each([
  ['MEDIA_CODEC_UNSUPPORTED', 'ARTIFACT_MEDIA_UNSUPPORTED'],
  ['MEDIA_DECODE_FAILED', 'ARTIFACT_MEDIA_DECODE_FAILED'],
  ['MEDIA_PROBE_FAILED', 'ARTIFACT_MEDIA_PROBE_FAILED'],
])('does not retry download for %s', (code, expected) => {
  expect(classifyMediaValidationFailure(1, { code })).toEqual({ code: expected, retryable: false });
});

test('preserves legacy native decode diagnostic instead of declaring corruption', () => {
  expect(classifyMediaValidationFailure(1, { code: 'MEDIA_INVALID', message: 'MEDIA_DECODE_FAILED' }))
    .toEqual({ code: 'ARTIFACT_MEDIA_DECODE_FAILED', retryable: false });
});

test('unknown probe errors do not prove file corruption', () => {
  expect(classifyMediaValidationFailure(1, new Error('bridge error'))).toEqual({ code: 'ARTIFACT_MEDIA_PROBE_FAILED', retryable: false });
});

test('classifies the first two invalid video attempts as retryable', () => {
  expect(classifyMediaValidationFailure(1)).toEqual({
    code: 'ARTIFACT_MEDIA_INVALID_RETRYABLE',
    retryable: true,
  });
  expect(classifyMediaValidationFailure(2)).toEqual({
    code: 'ARTIFACT_MEDIA_INVALID_RETRYABLE',
    retryable: true,
  });
});

test('classifies the third invalid video attempt as terminal', () => {
  expect(classifyMediaValidationFailure(3)).toEqual({
    code: 'ARTIFACT_MEDIA_INVALID',
    retryable: false,
  });
});

test('projects only safe Chinese media validation messages', () => {
  expect(mediaValidationMessage('ARTIFACT_MEDIA_INVALID_RETRYABLE')).toBe('视频文件校验失败，将自动重试');
  expect(mediaValidationMessage('ARTIFACT_MEDIA_INVALID')).toBe('视频文件损坏，请重新下载');
});
