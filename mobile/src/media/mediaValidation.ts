export type MediaValidationArtifactCode =
  | 'ARTIFACT_MEDIA_UNSUPPORTED'
  | 'ARTIFACT_MEDIA_DECODE_FAILED'
  | 'ARTIFACT_MEDIA_PROBE_FAILED'
  | 'ARTIFACT_MEDIA_INVALID_RETRYABLE'
  | 'ARTIFACT_MEDIA_INVALID';

export function mediaProbeFailureCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object') return undefined;
  const error = cause as { code?: string; message?: string; userInfo?: { diagnosticCode?: string } };
  if (error.code === 'MEDIA_INVALID') return error.userInfo?.diagnosticCode ?? (/^MEDIA_[A-Z_]+$/.test(error.message ?? '') ? error.message : error.code);
  return error.code;
}

export function classifyMediaValidationFailure(attempt: number, cause?: unknown): {
  code: MediaValidationArtifactCode;
  retryable: boolean;
} {
  const code = mediaProbeFailureCode(cause);
  if (code === 'MEDIA_CODEC_UNSUPPORTED') return { code: 'ARTIFACT_MEDIA_UNSUPPORTED', retryable: false };
  if (code === 'MEDIA_DECODE_FAILED') return { code: 'ARTIFACT_MEDIA_DECODE_FAILED', retryable: false };
  if (code === 'MEDIA_PROBE_FAILED' || code === 'MEDIA_INTEGRITY_UNAVAILABLE') return { code: 'ARTIFACT_MEDIA_PROBE_FAILED', retryable: false };
  if (cause !== undefined && !['MEDIA_INVALID', 'MEDIA_NAL_INVALID', 'MEDIA_SAMPLE_INVALID', 'MEDIA_NO_VIDEO_TRACK', 'MEDIA_DURATION_INVALID'].includes(code ?? '')) {
    return { code: 'ARTIFACT_MEDIA_PROBE_FAILED', retryable: false };
  }
  return Math.max(1, Math.floor(attempt)) < 3
    ? { code: 'ARTIFACT_MEDIA_INVALID_RETRYABLE', retryable: true }
    : { code: 'ARTIFACT_MEDIA_INVALID', retryable: false };
}

export function mediaValidationMessage(code: MediaValidationArtifactCode): string {
  if (code === 'ARTIFACT_MEDIA_UNSUPPORTED') return '当前设备不支持此视频编码，重新下载无法解决';
  if (code === 'ARTIFACT_MEDIA_DECODE_FAILED') return '设备无法完成视频解码校验，尚不能确定文件损坏';
  if (code === 'ARTIFACT_MEDIA_PROBE_FAILED') return '媒体探测未完成，请检查设备状态后重试';
  return code === 'ARTIFACT_MEDIA_INVALID_RETRYABLE'
    ? '视频文件校验失败，将自动重试'
    : '视频文件损坏，请重新下载';
}

export function mediaDownloadErrorMessage(error?: string): string | undefined {
  if (error === 'ARTIFACT_COMPATIBILITY_BUSY') return '正在等待其他视频完成兼容处理，将自动继续';
  if (error === 'ARTIFACT_COMPATIBILITY_FAILED') return '视频兼容转换失败，原件已保留；可重试本地转换或保存原件';
  if (error === 'ARTIFACT_COMPATIBILITY_HDR_UNSUPPORTED') return '暂不支持 HDR 视频的兼容转换，原件已保留';
  return error?.startsWith('ARTIFACT_MEDIA_') && ['ARTIFACT_MEDIA_UNSUPPORTED', 'ARTIFACT_MEDIA_DECODE_FAILED', 'ARTIFACT_MEDIA_PROBE_FAILED', 'ARTIFACT_MEDIA_INVALID', 'ARTIFACT_MEDIA_INVALID_RETRYABLE'].includes(error)
    ? mediaValidationMessage(error as MediaValidationArtifactCode) : error;
}
