jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})), backupDatabaseSync: jest.fn() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: jest.fn(() => ({})) }));

import { createMediaCommandFacade, createSyncTaskRunner } from './sync';

test('media command facade persists intent before kicking the foreground cycle', async () => {
  const order: string[] = [];
  const commands = {
    requestDownload: jest.fn(async () => { order.push('download'); return { status: 'queued' as const }; }),
    requestExport: jest.fn(async () => { order.push('export'); return { status: 'queued' as const }; }),
  };
  const runCycle = jest.fn(async () => { order.push('cycle'); return {} as never; });
  const facade = createMediaCommandFacade(commands, runCycle);
  await facade.requestTaskDownload('task-1');
  await facade.requestTaskExport('task-1', { keepPrivateCopy: false });
  expect(order).toEqual(['download', 'cycle', 'export', 'cycle']);
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
  const run = createSyncTaskRunner({ runCycle, repair, reconcile, listTasks, now: () => 500 });
  await expect(run('background')).resolves.toEqual({
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
    },
  });
  expect(runCycle).toHaveBeenCalledWith({ reason: 'background' });
  expect(repair.mock.invocationCallOrder[0]).toBeGreaterThan(runCycle.mock.invocationCallOrder[0]);
  expect(reconcile.mock.invocationCallOrder[0]).toBeGreaterThan(repair.mock.invocationCallOrder[0]);
  expect(listTasks.mock.invocationCallOrder[0]).toBeGreaterThan(reconcile.mock.invocationCallOrder[0]);
});
