import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createOperationRepository } from '../workflows/executor/operationRepository';
let mockDatabase: ReturnType<typeof createInitializedRealSqliteTestDb>;
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => mockDatabase }));
jest.mock('../settings/storage', () => ({ readSettings: async () => ({ token: '', autoExportToGallery: false, keepPrivateCopy: true }) }));
jest.mock('../storage/pendingMaintenance', () => ({ readPendingMaintenance: async () => undefined }));

test('real application runtime includes newly scheduled B even when a legacy caller supplies only A', async () => {
  mockDatabase = createInitializedRealSqliteTestDb();
  try {
    await createOperationRepository(mockDatabase as never).enqueue({ id: 'B:poll', jobId: 'B', kind: 'STATUS_SYNC', idempotencyKey: 'B:poll', payload: {}, now: Date.now(), nextRetryAt: Date.now() + 120000 });
    const { executorRunner, getMonitorQueue } = require('./executorRuntime') as typeof import('./executorRuntime');
    const result = await executorRunner.runSlice({ trigger: 'service', taskIds: ['A'] });
    expect(result.remainingScheduled).toBe(1);
    expect(result.nextWakeAt).toBeGreaterThan(Date.now());
    const stop = jest.fn(async () => true);
    expect(await (await getMonitorQueue()).stopIfIdle(0, stop)).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  } finally { mockDatabase.close(); }
});
