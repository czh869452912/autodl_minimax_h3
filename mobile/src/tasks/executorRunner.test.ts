import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { createExecutorRunner } from './executorRunner';

test('maintenance cooldown persists across runners and an explicit refresh bypasses it once', async () => {
  const db = createInitializedRealSqliteTestDb();
  const wakes = createExecutorWakeRepository(db as never);
  let timestamp = 100;
  const maintain = jest.fn(async () => undefined);
  const deps = { db: db as never, wakes, now: () => timestamp, maintain,
    runCycle: async () => ({ budgetExhausted: false }),
    pendingSummary: async () => ({ remainingDue: 0, remainingScheduled: 0 }) };
  try {
    await createExecutorRunner(deps).runSlice({ trigger: 'foreground' });
    await createExecutorRunner(deps).runSlice({ trigger: 'background' });
    expect(maintain).toHaveBeenCalledTimes(1);
    await wakes.requestWake(timestamp, 'force-next-slice');
    await wakes.requestWake(timestamp, 'force-next-slice');
    await createExecutorRunner(deps).runSlice({ trigger: 'command' });
    await createExecutorRunner(deps).runSlice({ trigger: 'timer' });
    expect(maintain).toHaveBeenCalledTimes(2);
    timestamp += 300_000;
    await createExecutorRunner(deps).runSlice({ trigger: 'foreground' });
    expect(maintain).toHaveBeenCalledTimes(3);
  } finally { db.close(); }
});

test('competing runtimes cannot run a cycle and a mid-slice wake survives acknowledgement', async () => {
  const db = createInitializedRealSqliteTestDb();
  const wakes = createExecutorWakeRepository(db as never);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  let runs = 0;
  let repairs = 0;
  const deps = {
    db: db as never, wakes, now: () => 100,
    runCycle: async () => { runs++; started(); await new Promise<void>(resolve => { release = resolve; }); return { budgetExhausted: false }; },
    pendingSummary: async () => ({ remainingDue: 0, remainingScheduled: 0 }),
    maintain: async () => { repairs++; },
  };
  try {
    await wakes.requestWake(100, 'force-next-slice');
    const first = createExecutorRunner(deps).runSlice({ trigger: 'foreground' });
    await entered;
    const contender = await createExecutorRunner(deps).runSlice({ trigger: 'background' });
    expect(contender.handledGeneration).toBe(0);
    expect(runs).toBe(1);
    await wakes.requestWake(101);
    release();
    expect(await first).toMatchObject({ capturedGeneration: 1, handledGeneration: 1, nextWakeAt: 1100 });
    expect(await wakes.read()).toMatchObject({ generation: 2, handledGeneration: 1 });
    expect(repairs).toBe(1);
  } finally { db.close(); }
});
