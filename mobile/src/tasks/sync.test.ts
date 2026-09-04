jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})), backupDatabaseSync: jest.fn() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: jest.fn(() => ({})) }));

import { createMediaCommandFacade, createSyncTaskRunner } from './sync';

test('media command facade persists intent before kicking the foreground cycle', async () => {
  const order: string[] = [];
  const commands = {
    requestDownload: jest.fn(async () => { order.push('download'); return { status: 'queued' as const }; }),
    requestExport: jest.fn(async () => { order.push('export'); return { status: 'queued' as const }; }),
    requestRedownload: jest.fn(async () => { order.push('redownload'); return { status: 'queued' as const }; }),
  };
  const runCycle = jest.fn(async () => { order.push('cycle'); return {} as never; });
  const facade = createMediaCommandFacade(commands, runCycle);
  await facade.requestTaskDownload('task-1');
  await facade.requestTaskExport('task-1', { keepPrivateCopy: false });
  await facade.requestTaskRedownload('task-1');
  expect(order).toEqual(['download', 'cycle', 'export', 'cycle', 'redownload', 'cycle']);
  expect(commands.requestExport).toHaveBeenCalledWith('task-1', { keepPrivateCopy: false });
});

test('compatibility facade routes through the bounded executor cycle and converts its summary', async () => {
  const runCycle = jest.fn(async () => ({
    claimed: 3,
    succeeded: 2,
    retried: 0,
    failed: 1,
    blocked: 0,
    remainingDue: 4,
    remainingScheduled: 2,
    passes: 2,
    budgetExhausted: false,
  }));
  const repair = jest.fn(async () => 2);
  const reconcile = jest.fn(async () => ({ scanned: 3, repaired: 1, staleFiles: 0, garbageDeleted: 0, garbageFailed: 0 }));
  const listTasks = jest.fn(async () => [{ id: 'task-1' }] as never);
  const pendingSummary = jest.fn(() => ({ remainingDue: 4, remainingScheduled: 2 }));
  const claimMaintenance = jest.fn(() => true);
  const run = createSyncTaskRunner({ runCycle, repair, reconcile, listTasks, pendingSummary, claimMaintenance, listTerminalEvents: jest.fn(() => []), now: () => 500 });
  await expect(run({ reason: 'background', mode: 'maintenance' })).resolves.toEqual({
    tasks: [{ id: 'task-1' }],
    summary: {
      updated: 2,
      failed: 1,
      skipped: 0,
      remaining: 6,
      lastSyncAt: 500,
      operations: {
        claimed: 3,
        succeeded: 2,
        retried: 0,
        failed: 1,
        blocked: 0,
        remainingDue: 4,
        remainingScheduled: 2,
        passes: 2,
        budgetExhausted: false,
      },
      reconciliation: { scanned: 3, repaired: 1, staleFiles: 0, garbageDeleted: 0, garbageFailed: 0 },
      maintenanceRan: true,
      terminalEvents: [],
    },
  });
  expect(runCycle).toHaveBeenCalledWith({ reason: 'background' });
  expect(repair.mock.invocationCallOrder[0]).toBeGreaterThan(runCycle.mock.invocationCallOrder[0]);
  expect(reconcile.mock.invocationCallOrder[0]).toBeGreaterThan(repair.mock.invocationCallOrder[0]);
  expect(listTasks.mock.invocationCallOrder[0]).toBeGreaterThan(reconcile.mock.invocationCallOrder[0]);
});

test('poll skips maintenance and service reports only scoped outstanding work', async () => {
  const operations = {
    claimed: 0, succeeded: 0, retried: 0, failed: 0, blocked: 0,
    remainingDue: 20, remainingScheduled: 30, passes: 1, budgetExhausted: false,
  };
  const runCycle = jest.fn(async () => operations);
  const repair = jest.fn(async () => 0);
  const fileExists = jest.fn(async (_uri: string) => true);
  const removeCasPath = jest.fn(async (_path: string) => undefined);
  const reconcile = jest.fn(async () => {
    await fileExists('file:///history.mp4');
    await removeCasPath('cas/history.mp4');
    return { scanned: 100, repaired: 0, staleFiles: 0, garbageDeleted: 0, garbageFailed: 0 };
  });
  const pendingSummary = jest.fn(({ jobIds }: { jobIds?: string[] }) => jobIds ? { remainingDue: 1, remainingScheduled: 2, nextWakeAt: 900 } : { remainingDue: 20, remainingScheduled: 30 });
  const run = createSyncTaskRunner({
    runCycle, repair, reconcile, pendingSummary, claimMaintenance: jest.fn(() => true), listTerminalEvents: jest.fn(() => []),
    listTasks: jest.fn(async () => Array.from({ length: 100 }, (_, id) => ({ id })) as never), now: () => 500,
  });

  const poll = await run({ reason: 'foreground', mode: 'poll' });
  expect(poll.summary).toMatchObject({ updated: 0, remaining: 50, maintenanceRan: false, reconciliation: { scanned: 0 } });
  expect(repair).not.toHaveBeenCalled();
  expect(reconcile).not.toHaveBeenCalled();
  expect(fileExists).not.toHaveBeenCalled();
  expect(removeCasPath).not.toHaveBeenCalled();

  const service = await run({ reason: 'service', mode: 'service', taskIds: ['job-a'] });
  expect(service.summary).toMatchObject({ remaining: 3, maintenanceRan: false, terminalEvents: [] });
  expect(pendingSummary).toHaveBeenLastCalledWith({ now: 500, jobIds: ['job-a'] });
});

test('maintenance obeys cooldown while force requests always run repair and reconciliation', async () => {
  const runCycle = jest.fn(async () => ({ claimed: 0, succeeded: 0, retried: 0, failed: 0, blocked: 0, remainingDue: 0, remainingScheduled: 0, passes: 1, budgetExhausted: false }));
  const repair = jest.fn(async () => 1);
  const reconcile = jest.fn(async () => ({ scanned: 1, repaired: 0, staleFiles: 0, garbageDeleted: 0, garbageFailed: 0 }));
  let claimCount = 0;
  const claimMaintenance = jest.fn((_force: boolean): boolean => { claimCount += 1; return claimCount !== 2; });
  const run = createSyncTaskRunner({ runCycle, repair, reconcile, claimMaintenance, listTerminalEvents: jest.fn(() => []), pendingSummary: jest.fn(() => ({ remainingDue: 0, remainingScheduled: 0 })), listTasks: jest.fn(async () => []), now: () => 500 });

  expect((await run({ reason: 'foreground', mode: 'maintenance' })).summary.maintenanceRan).toBe(true);
  expect((await run({ reason: 'foreground', mode: 'maintenance' })).summary.maintenanceRan).toBe(false);
  expect((await run({ reason: 'foreground', mode: 'maintenance', forceMaintenance: true })).summary.maintenanceRan).toBe(true);
  expect(repair).toHaveBeenCalledTimes(2);
  expect(reconcile).toHaveBeenCalledTimes(2);
  expect(claimMaintenance).toHaveBeenNthCalledWith(3, true);
});
