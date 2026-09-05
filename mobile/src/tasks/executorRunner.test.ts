import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { createExecutorRunner } from './executorRunner';

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
