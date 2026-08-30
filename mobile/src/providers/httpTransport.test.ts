import { captureNativeHttpTransport, getNativeHttpTransport } from './httpTransport';

test('keeps the captured provider transport after the global fetch is replaced', () => {
  const nativeFetch = jest.fn();
  const streamingFetch = jest.fn();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = nativeFetch as unknown as typeof fetch;
  try {
    const captured = captureNativeHttpTransport();
    globalThis.fetch = streamingFetch as unknown as typeof fetch;
    expect(getNativeHttpTransport()).toBe(captured);
    expect(getNativeHttpTransport()).toBe(nativeFetch);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
