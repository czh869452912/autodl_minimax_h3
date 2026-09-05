import { getDatabase } from '../storage/databaseClient';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { executorWakePort } from './executorEvents';
import { taskProjectionEvents } from './taskProjectionEvents';
import { resumeAfterConnectivityReturns } from './networkRecovery';

export async function resumeConnectivityWork() {
  const db = getDatabase();
  return resumeAfterConnectivityReturns({
    listActiveJobIds: async () => (await db.getAllAsync<{ id: string }>(`SELECT id FROM tasks WHERE status IN ('QUEUED','RUNNING','UNKNOWN')
      UNION SELECT job_id AS id FROM workflow_operations WHERE state='PENDING' AND job_id IS NOT NULL`)).map(row => row.id),
    async expediteRetryableNetwork(ids, now) {
      let count = 0;
      await db.withExclusiveTransactionAsync(async txn => {
        count = await createOperationRepository(txn).expediteRetryableNetwork(ids, now);
        if (ids.length) await createExecutorWakeRepository(txn).requestWake(now);
      });
      taskProjectionEvents.invalidate();
      return count;
    },
    signal: executorWakePort.signal,
    now: Date.now,
  });
}
