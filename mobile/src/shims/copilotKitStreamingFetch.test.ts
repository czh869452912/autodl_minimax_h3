import { configureStreamingFetch, getStreamingFetchTimeout, createStreamingFetch } from './copilotKitStreamingFetch';

describe('Android streaming fetch configuration', () => {
  it('uses a configurable timeout with a 10 minute default', () => {
    configureStreamingFetch({ timeoutMs: 900000 });
    expect(getStreamingFetchTimeout()).toBe(900000);
    configureStreamingFetch({ timeoutMs: 600000 });
  });

  it('keeps each model transport timeout independent of later global configuration', async () => {
    const original = globalThis.XMLHttpRequest;
    const sent: any[] = [];
    class FakeXhr {
      timeout = 0;
      open() {}
      setRequestHeader() {}
      send() { sent.push(this); }
      abort() {}
    }
    (globalThis as any).XMLHttpRequest = FakeXhr;
    try {
      const first = createStreamingFetch({ timeoutMs: 1000 });
      const second = createStreamingFetch({ timeoutMs: 2000 });
      configureStreamingFetch({ timeoutMs: 9000 });
      const one = new AbortController(); const two = new AbortController();
      const pending = [first('https://example.test', { signal: one.signal }), second('https://example.test', { signal: two.signal })];
      expect(sent.map(xhr => xhr.timeout)).toEqual([1000, 2000]);
      one.abort(); two.abort();
      await Promise.all(pending.map(request => expect(request).rejects.toThrow()));
    } finally { globalThis.XMLHttpRequest = original; configureStreamingFetch({ timeoutMs: 600000 }); }
  });
});
