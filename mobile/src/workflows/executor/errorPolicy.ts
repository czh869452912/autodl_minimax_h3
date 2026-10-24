import type { NormalizedError } from '../../jobs/types';
import { ProviderError,ProviderPreflightError } from '../providers/errors';
import type { OperationKind } from './types';

export type FailureDisposition = 'TERMINAL' | 'RETRYABLE' | 'UNKNOWN' | 'BLOCKED';
export type ClassifiedProviderFailure = { disposition: FailureDisposition; error: NormalizedError };

function operationName(kind: OperationKind): 'submit' | 'status' | 'artifact' | 'export' {
  if (kind === 'SUBMIT') return 'submit';
  if (kind === 'STATUS_SYNC') return 'status';
  if (kind === 'ARTIFACT_DOWNLOAD') return 'artifact';
  return 'export';
}

function disposition(kind: OperationKind, error: ProviderError): FailureDisposition {
  if (kind === 'STATUS_SYNC') {
    if (error.kind === 'auth') return 'BLOCKED';
    if (error.status === 408 || error.status === 429 || (error.status != null && error.status >= 500)) return 'RETRYABLE';
    if (error.kind === 'provider' || (error.status != null && error.status >= 400)) return 'BLOCKED';
    return 'RETRYABLE';
  }
  const deterministicHttp = error.status != null && error.status >= 400 && error.status < 500;
  if (error.kind === 'auth' || deterministicHttp || error.kind === 'provider') return 'TERMINAL';
  if (kind === 'SUBMIT') return 'UNKNOWN';
  return 'RETRYABLE';
}

export function classifyProviderFailure(kind: OperationKind, cause: unknown): ClassifiedProviderFailure {
  if(cause instanceof ProviderPreflightError)return {disposition:'TERMINAL',error:{code:cause.code,message:cause.message,retryable:false}};
  const operation = operationName(kind);
  if (!(cause instanceof ProviderError)) {
    const unknown = kind === 'SUBMIT';
    return {
      disposition: unknown ? 'UNKNOWN' : 'RETRYABLE',
      error: {
        code: `PROVIDER_${operation.toUpperCase()}_UNKNOWN`,
        message: unknown
          ? `Provider ${operation} request outcome is unknown.`
          : `Provider ${operation} request failed.`,
        ...(unknown ? {} : { retryable: true }),
      },
    };
  }
  const result = disposition(kind, cause);
  const status = cause.status == null ? '' : `_${cause.status}`;
  return {
    disposition: result,
    error: {
      code: `${cause.provider.toUpperCase()}_${operation.toUpperCase()}_${cause.kind.toUpperCase()}${status}`,
      message: cause.provider==='novelai' && result==='TERMINAL'
        ? (cause.kind==='auth'?'NovelAI 凭据已失效或无权生成，请在创作账号中重新连接。':cause.status===402?'NovelAI 额度不足，请检查订阅与 Anlas 余额后重新生成。':cause.status===429?'NovelAI 请求过于频繁，请稍后重新生成。':'NovelAI 拒绝了本次请求，请检查模型、生成参数与账号权限。')
        : result === 'BLOCKED'
        ? (cause.kind === 'auth' ? '任务同步已暂停，请在设置中修复 AutoDL 凭据后刷新任务。' : '任务同步已暂停，请核查 AutoDL 任务后刷新重试。')
        : result === 'UNKNOWN'
        ? `Provider ${operation} request outcome is unknown.`
        : `Provider ${operation} request failed.`,
      ...(result === 'RETRYABLE' ? { retryable: true } : {}),
    },
  };
}
