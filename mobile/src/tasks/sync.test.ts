jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => ({})), backupDatabaseSync: jest.fn() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: jest.fn(() => ({})) }));

import { createSyncTaskRunner } from './sync';

test('compatibility facade routes through the bounded executor tick and converts its summary', async () => {
  const runTick = jest.fn(async () => ({ claimed: 3, succeeded: 2, retried: 0, failed: 1, blocked: 0, remainingDue: 4 }));
  const repair = jest.fn(async () => 2);
  const listTasks = jest.fn(async () => [{ id: 'task-1' }] as never);
  const run = createSyncTaskRunner({ runTick, repair, listTasks, now: () => 500 });
  await expect(run('background')).resolves.toEqual({
    tasks: [{ id: 'task-1' }],
    summary: {
      updated: 2,
      failed: 1,
      skipped: 0,
      remaining: 4,
      lastSyncAt: 500,
      operations: { claimed: 3, succeeded: 2, retried: 0, failed: 1, blocked: 0, remainingDue: 4 },
    },
  });
  expect(runTick).toHaveBeenCalledWith({ reason: 'background' });
  expect(repair.mock.invocationCallOrder[0]).toBeGreaterThan(runTick.mock.invocationCallOrder[0]);
});
