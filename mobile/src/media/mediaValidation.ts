export type MediaValidationArtifactCode =
  | 'ARTIFACT_MEDIA_INVALID_RETRYABLE'
  | 'ARTIFACT_MEDIA_INVALID';

export function classifyMediaValidationFailure(attempt: number): {
  code: MediaValidationArtifactCode;
  retryable: boolean;
} {
  return Math.max(1, Math.floor(attempt)) < 3
    ? { code: 'ARTIFACT_MEDIA_INVALID_RETRYABLE', retryable: true }
    : { code: 'ARTIFACT_MEDIA_INVALID', retryable: false };
}

export function mediaValidationMessage(code: MediaValidationArtifactCode): string {
  return code === 'ARTIFACT_MEDIA_INVALID_RETRYABLE'
    ? '视频文件校验失败，将自动重试'
    : '视频文件损坏，请重新下载';
}
