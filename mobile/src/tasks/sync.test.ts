jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})), backupDatabaseSync: jest.fn() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: jest.fn(() => ({})) }));

import { createSyncTaskRunner } from './sync';

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
