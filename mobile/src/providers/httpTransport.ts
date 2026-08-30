export type HttpTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let capturedTransport: HttpTransport | undefined;

export function captureNativeHttpTransport(transport: HttpTransport = globalThis.fetch): HttpTransport {
  if (!capturedTransport) capturedTransport = transport;
  return capturedTransport;
}

export function getNativeHttpTransport(): HttpTransport {
  return capturedTransport ?? captureNativeHttpTransport();
}
