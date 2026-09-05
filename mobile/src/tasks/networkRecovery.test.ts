import { createConnectivityEdgeDetector, resumeAfterConnectivityReturns } from './networkRecovery';

test('fires only on the first explicit offline-to-online edge', () => {
  const detector = createConnectivityEdgeDetector();
  expect(detector.observe(undefined)).toBe(false);
  expect(detector.observe(true)).toBe(false);
  expect(detector.observe(true)).toBe(false);
  expect(detector.observe(false)).toBe(false);
  expect(detector.observe(false)).toBe(false);
  expect(detector.observe(true)).toBe(true);
  expect(detector.observe(true)).toBe(false);
});

test('expedites scoped retryable work before polling active tasks', async () => {
  const order: string[] = [];
  const signal = jest.fn(async () => { order.push('signal'); });
  const expediteRetryableNetwork = jest.fn(async () => { await Promise.resolve(); order.push('expedite'); return 2; });
  const result = await resumeAfterConnectivityReturns({
    listActiveJobIds: async () => ['job-a'],
    expediteRetryableNetwork,
    signal,
    now: () => 1_000,
  });

  expect(result).toEqual({ activeJobIds: ['job-a'], expedited: 2, signaled: true });
  expect(expediteRetryableNetwork).toHaveBeenCalledWith(['job-a'], 1_000);
  expect(signal).toHaveBeenCalledWith('connectivity');
  expect(order).toEqual(['expedite', 'signal']);
});

test('does nothing when no active task or retryable operation exists', async () => {
  const signal = jest.fn(async () => undefined);
  const result = await resumeAfterConnectivityReturns({
    listActiveJobIds: async () => [],
    expediteRetryableNetwork: jest.fn(async () => 0),
    signal,
    now: () => 1_000,
  });
  expect(result.signaled).toBe(false);
  expect(signal).not.toHaveBeenCalled();
});
