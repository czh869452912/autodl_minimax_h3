import { classifyMediaValidationFailure, mediaValidationMessage } from './mediaValidation';

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
