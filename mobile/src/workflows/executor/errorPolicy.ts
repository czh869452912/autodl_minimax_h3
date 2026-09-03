import type { NormalizedError } from '../../jobs/types';
import { ProviderError } from '../providers/autodl/client';
import type { OperationKind } from './types';

export type FailureDisposition = 'TERMINAL' | 'RETRYABLE' | 'UNKNOWN';
export type ClassifiedProviderFailure = { disposition: FailureDisposition; error: NormalizedError };

function operationName(kind: OperationKind): 'submit' | 'status' | 'artifact' | 'export' {
  if (kind === 'SUBMIT') return 'submit';
  if (kind === 'STATUS_SYNC') return 'status';
  if (kind === 'ARTIFACT_DOWNLOAD') return 'artifact';
  return 'export';
}

function disposition(kind: OperationKind, error: ProviderError): FailureDisposition {
  const deterministicHttp = error.status != null && error.status >= 400 && error.status < 500;
  if (error.kind === 'auth' || deterministicHttp || error.kind === 'provider') return 'TERMINAL';
  if (kind === 'SUBMIT') return 'UNKNOWN';
  return 'RETRYABLE';
}

export function classifyProviderFailure(kind: OperationKind, cause: unknown): ClassifiedProviderFailure {
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
      message: result === 'UNKNOWN'
        ? `Provider ${operation} request outcome is unknown.`
        : `Provider ${operation} request failed.`,
      ...(result === 'RETRYABLE' ? { retryable: true } : {}),
    },
  };
}
