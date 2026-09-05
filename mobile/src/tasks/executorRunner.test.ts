import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { createExecutorRunner } from './executorRunner';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createExecutorTick } from '../workflows/executor/tick';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test.each(['cross-lane', 'same-lane'] as const)('%s claim failure holds the scheduler lease until active work settles', async mode => {
  const db = createInitializedRealSqliteTestDb();
  const operations = createOperationRepository(db as never);
  const wakes = createExecutorWakeRepository(db as never);
  const started = gate();
  const release = gate();
  const drained = gate();
  const failure = new Error('OPERATION_CLAIM_FENCE_MISMATCH');
  let active = false;
  let settled = false;
  const kinds = mode === 'cross-lane' ? ['SUBMIT', 'ARTIFACT_DOWNLOAD'] as const : ['STATUS_SYNC', 'STATUS_SYNC'] as const;
  for (const [index, kind] of kinds.entries()) {
    await operations.enqueue({ id: `op-${index}`, kind, idempotencyKey: `key-${index}`, payload: {}, now: 100 });
  }
  const claim = operations.claimById.bind(operations);
  jest.spyOn(operations, 'claimById').mockImplementation(async (id, ...args) => {
    if (id === 'op-0') {
      await started.promise;
      throw failure;
    }
    return claim(id, ...args);
  });
  const get = operations.get.bind(operations);
  jest.spyOn(operations, 'get').mockImplementation(async id => {
    try { return await get(id); }
    finally { if (id === 'op-1' && !active) drained.resolve(); }
  });
  const tick = createExecutorTick({ operations, owner: () => 'first-worker', isReadonly: () => false,
    executor: { recover: async () => undefined, handle: async (operation, owner) => {
      active = true;
      started.resolve();
      await release.promise;
      await operations.finish(operation.id, owner, 'SUCCEEDED', 100);
      active = false;
    } },
  });
  const deps = { db: db as never, wakes, now: () => 100,
    maintain: async () => undefined,
    pendingSummary: async () => ({ remainingDue: 0, remainingScheduled: 0 }),
    runCycle: async () => { await tick.run({ reason: 'foreground', now: 100 }); return { budgetExhausted: false }; },
  };
  await wakes.requestWake(100);
  const outcome = createExecutorRunner(deps).runSlice({ trigger: 'foreground' }).then(
    result => { settled = true; return result; },
    error => { settled = true; return error; },
  );
  try {
    await started.promise;
    // Allow the failed claim and its rejection handlers to drain without releasing active work.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(active).toBe(true);
    expect(db.getFirstSync('SELECT owner FROM app_scheduler_leases WHERE lease_key=?', 'task-executor')).toBeDefined();
    let competingCycles = 0;
    const contender = createExecutorRunner({ ...deps, runCycle: async () => {
      competingCycles++;
      return { budgetExhausted: false };
    } });
    await contender.runSlice({ trigger: 'background' });
    expect(competingCycles).toBe(0);
    release.resolve();
    expect(await outcome).toBe(failure);
    expect(await operations.get('op-1')).toMatchObject({ state: 'SUCCEEDED' });
    expect(db.getFirstSync('SELECT owner FROM app_scheduler_leases WHERE lease_key=?', 'task-executor')).toBeUndefined();
    expect(await wakes.read()).toMatchObject({ generation: 1, handledGeneration: 0 });
    await contender.runSlice({ trigger: 'background' });
    expect(competingCycles).toBe(1);
  } finally {
    release.resolve();
    await outcome;
    await drained.promise;
    db.close();
  }
});

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
