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
  const runPoll = jest.fn(async () => { order.push('poll'); });
  const expediteRetryableNetwork = jest.fn(() => { order.push('expedite'); return 2; });
  const result = await resumeAfterConnectivityReturns({
    listActiveJobIds: async () => ['job-a'],
    expediteRetryableNetwork,
    runPoll,
    now: () => 1_000,
  });

  expect(result).toEqual({ activeJobIds: ['job-a'], expedited: 2, polled: true });
  expect(expediteRetryableNetwork).toHaveBeenCalledWith(['job-a'], 1_000);
  expect(runPoll).toHaveBeenCalledWith({ reason: 'foreground', mode: 'poll', taskIds: ['job-a'] });
  expect(order).toEqual(['expedite', 'poll']);
});

test('does nothing when no active task or retryable operation exists', async () => {
  const runPoll = jest.fn(async () => undefined);
  const result = await resumeAfterConnectivityReturns({
    listActiveJobIds: async () => [],
    expediteRetryableNetwork: jest.fn(() => 0),
    runPoll,
    now: () => 1_000,
  });
  expect(result.polled).toBe(false);
  expect(runPoll).not.toHaveBeenCalled();
});
