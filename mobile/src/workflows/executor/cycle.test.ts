import { createExecutorCycle } from './cycle';
import type { TickSummary } from './tick';

const summary = (patch: Partial<TickSummary> = {}): TickSummary => ({
  claimed: 0,
  succeeded: 0,
  retried: 0,
  failed: 0,
  blocked: 0,
  remainingDue: 0,
  remainingScheduled: 0,
  ...patch,
});

test('runs newly-created due work in later bounded passes', async () => {
  const runTick = jest.fn()
    .mockResolvedValueOnce(summary({ claimed: 1, succeeded: 1, remainingScheduled: 1 }))
    .mockResolvedValueOnce(summary({ claimed: 1, succeeded: 1 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });

  await expect(cycle.run({ reason: 'foreground', maxPasses: 4, maxOperationsTotal: 8 })).resolves.toMatchObject({
    passes: 2,
    claimed: 2,
    succeeded: 2,
    remainingDue: 0,
    budgetExhausted: false,
  });
});

test('refreshes the clock between passes so asynchronously-created work is due', async () => {
  const runTick = jest.fn()
    .mockResolvedValueOnce(summary({ claimed: 1, succeeded: 1, remainingDue: 1 }))
    .mockResolvedValueOnce(summary({ claimed: 1, succeeded: 1 }));
  const now = jest.fn()
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(125);
  const cycle = createExecutorCycle({ runTick, now });

  await cycle.run({ reason: 'foreground' });

  expect(runTick).toHaveBeenNthCalledWith(1, expect.objectContaining({ now: 100 }));
  expect(runTick).toHaveBeenNthCalledWith(2, expect.objectContaining({ now: 125 }));
});

test('stops at both budgets without draining indefinitely', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 2, succeeded: 2, remainingDue: 3 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });

  await expect(cycle.run({ reason: 'service', maxPasses: 2, maxOperationsTotal: 3 })).resolves.toMatchObject({
    passes: 2,
    claimed: 3,
    remainingDue: 3,
    budgetExhausted: true,
  });
  expect(runTick).toHaveBeenNthCalledWith(2, expect.objectContaining({ maxOperations: 1 }));
});

test('caps a cycle at 32 operations by default', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 8, succeeded: 8, remainingDue: 1 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });

  await expect(cycle.run({ reason: 'service', maxPasses: 99, maxOperationsTotal: 99 })).resolves.toMatchObject({
    passes: 4,
    claimed: 32,
    succeeded: 32,
    remainingDue: 1,
    budgetExhausted: true,
  });
  expect(runTick).toHaveBeenCalledTimes(4);
  expect(runTick).toHaveBeenLastCalledWith(expect.objectContaining({ maxOperations: 8 }));
});

test('stops a cycle after its 2,000 millisecond time budget', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 1, succeeded: 1, remainingDue: 1 }));
  const now = jest.fn()
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(2_100);
  const cycle = createExecutorCycle({ runTick, now });

  await expect(cycle.run({ reason: 'background' })).resolves.toMatchObject({
    passes: 1,
    claimed: 1,
    remainingDue: 1,
    budgetExhausted: true,
  });
  expect(runTick).toHaveBeenCalledTimes(1);
});

test('enforces its elapsed-time budget when a caller fixes the tick timestamp', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 1, succeeded: 1, remainingDue: 1 }));
  const now = jest.fn()
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(2_100);
  const cycle = createExecutorCycle({ runTick, now });

  await expect(cycle.run({ reason: 'background', now: 100 })).resolves.toMatchObject({
    passes: 1,
    claimed: 1,
    remainingDue: 1,
    budgetExhausted: true,
  });
  expect(runTick).toHaveBeenCalledTimes(1);
  expect(runTick).toHaveBeenCalledWith(expect.objectContaining({ now: 100 }));
});

test('stops when a pass claims nothing even if another writer reports due work', async () => {
  const runTick = jest.fn(async () => summary({ claimed: 0, remainingDue: 1 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });

  await cycle.run({ reason: 'background' });

  expect(runTick).toHaveBeenCalledTimes(1);
});

test('propagates the next durable wake time from the final pass', async () => {
  const runTick = jest.fn(async () => summary({ remainingScheduled: 1, nextWakeAt: 60_000 }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });

  await expect(cycle.run({ reason: 'foreground' })).resolves.toMatchObject({
    remainingScheduled: 1,
    nextWakeAt: 60_000,
  });
});

test('overlapping callers share one bounded cycle', async () => {
  let resolveTick!: (value: TickSummary) => void;
  const runTick = jest.fn(() => new Promise<TickSummary>((resolve) => { resolveTick = resolve; }));
  const cycle = createExecutorCycle({ runTick, now: () => 100 });

  const first = cycle.run({ reason: 'foreground' });
  const second = cycle.run({ reason: 'service' });
  resolveTick(summary());

  await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  expect(runTick).toHaveBeenCalledTimes(1);
});
