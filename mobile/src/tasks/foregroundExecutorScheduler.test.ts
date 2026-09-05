import { createExecutorEvents } from './executorEvents';
import { startForegroundExecutorScheduler } from './foregroundExecutorScheduler';

afterEach(() => jest.useRealTimers());

test('schedules persisted time, minimum continuation, and stops cleanly', async () => {
  jest.useFakeTimers({ now: 0 });
  const events = createExecutorEvents();
  let calls = 0;
  const scheduler = startForegroundExecutorScheduler({ events, runner: { runSlice: async () => {
    calls++;
    return { capturedGeneration: 0, handledGeneration: 0, remainingDue: calls === 2 ? 1 : 0, remainingScheduled: 1, nextWakeAt: calls === 1 ? 5000 : 5001, budgetExhausted: false };
  } } });
  await jest.advanceTimersByTimeAsync(0);
  expect(events.getSnapshot()).toMatchObject({ phase: 'scheduled', nextWakeAt: 5000 });
  await jest.advanceTimersByTimeAsync(4999);
  expect(calls).toBe(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(calls).toBe(2);
  await jest.advanceTimersByTimeAsync(999);
  expect(calls).toBe(2);
  scheduler.stop();
  events.signal('command');
  await jest.advanceTimersByTimeAsync(10000);
  expect(calls).toBe(2);
  expect(jest.getTimerCount()).toBe(0);
});

test('wake during running guarantees a trailing slice and failure backs off', async () => {
  jest.useFakeTimers({ now: 0 });
  const events = createExecutorEvents();
  let release!: () => void;
  let calls = 0;
  const scheduler = startForegroundExecutorScheduler({ events, random: () => 0, runner: { runSlice: async () => {
    calls++;
    if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
    else throw new Error('offline');
    return { capturedGeneration: 0, handledGeneration: 0, remainingDue: 0, remainingScheduled: 0, budgetExhausted: false };
  } } });
  await jest.advanceTimersByTimeAsync(0);
  events.signal('command');
  release();
  await jest.advanceTimersByTimeAsync(1000);
  expect(calls).toBe(2);
  expect(events.getSnapshot()).toMatchObject({ phase: 'backoff', error: 'offline', nextWakeAt: 2000 });
  await jest.advanceTimersByTimeAsync(1000);
  expect(events.getSnapshot()).toMatchObject({ phase: 'backoff', nextWakeAt: 4000 });
  scheduler.stop();
});
