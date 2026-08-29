import { configureStreamingFetch, getStreamingFetchTimeout } from './copilotKitStreamingFetch';

describe('Android streaming fetch configuration', () => {
  it('uses a configurable timeout with a 10 minute default', () => {
    configureStreamingFetch({ timeoutMs: 900000 });
    expect(getStreamingFetchTimeout()).toBe(900000);
    configureStreamingFetch({ timeoutMs: 600000 });
  });
});
