export type ProviderErrorKind = 'network' | 'timeout' | 'auth' | 'http' | 'provider' | 'response';

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly operation: 'submit' | 'status',
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}
