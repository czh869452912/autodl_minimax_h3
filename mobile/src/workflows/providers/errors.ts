export type ProviderErrorKind = 'network' | 'timeout' | 'auth' | 'http' | 'provider' | 'response';

/** A local failure before a provider request can be sent. */
export class ProviderPreflightError extends Error {constructor(public readonly code:string,message:string){super(message);this.name='ProviderPreflightError';}}

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
