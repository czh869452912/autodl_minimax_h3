import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createJobRepository } from '../jobs/repository';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { quarantineRestoredExecution } from './restoreIsolation';

test('an old pending snapshot never becomes dispatchable after restore or re-enqueue', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const jobs = createJobRepository(db as never);
    await jobs.upsert({ id: 'old-job', revision: 0, workflowId: 'w', workflowVersion: '1', workflowContentHash: 'h', adapterId: 'a', adapterVersion: '1', inputSnapshot: {}, status: 'READY_TO_SUBMIT', createdAt: 1, updatedAt: 1 });
    const operations = createOperationRepository(db as never);
    operations.enqueue({ id: 'old-submit', kind: 'SUBMIT', jobId: 'old-job', idempotencyKey: 'old', payload: {}, now: 1 });
    operations.enqueue({ id: 'standalone-export', kind: 'EXPORT', idempotencyKey: 'export', payload: {}, now: 1 });
    // The remote request may have succeeded after this snapshot was taken.
    quarantineRestoredExecution(db as never, 'a'.repeat(32));
    expect(await operations.listDueSnapshot({ now: 100, perLaneLimit: 10 })).toEqual([]);
    expect((await jobs.get('old-job'))?.status).toBe('UNKNOWN');
    expect(operations.enqueue({ id: 'requeued', kind: 'SUBMIT', jobId: 'old-job', idempotencyKey: 'new-key-old-job', payload: {}, now: 2 }).state).toBe('BLOCKED');
    expect(() => db.runSync("UPDATE workflow_operations SET state='PENDING' WHERE id='old-submit'")).toThrow('RESTORED_EXECUTION_REQUIRES_REVIEW');
    expect(() => db.runSync("UPDATE workflow_operations SET state='CLAIMED' WHERE id='standalone-export'")).toThrow('RESTORED_EXECUTION_REQUIRES_REVIEW');
    // New explicit operations are not confused with restored work.
    expect(operations.enqueue({ id: 'new', kind: 'SUBMIT', jobId: 'new-job', idempotencyKey: 'new', payload: {}, now: 2 }).state).toBe('PENDING');
    quarantineRestoredExecution(db as never, 'b'.repeat(32));
    expect((await operations.get('new'))?.state).toBe('BLOCKED');
    expect(db.getFirstSync('SELECT epoch FROM creative_execution_state')).toEqual({ epoch: 'b'.repeat(32) });
  } finally { db.close(); }
});

test('failure during quarantine leaves no partially changed execution state', () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const before = db.getFirstSync('SELECT epoch FROM creative_execution_state');
    db.execSync("CREATE TRIGGER injected_restore_failure BEFORE INSERT ON creative_restore_quarantine BEGIN SELECT RAISE(ABORT,'injected'); END");
    createOperationRepository(db as never).enqueue({ id: 'pending', kind: 'EXPORT', idempotencyKey: 'pending', payload: {}, now: 1 });
    expect(() => quarantineRestoredExecution(db as never, 'c'.repeat(32))).toThrow('injected');
    expect(db.getFirstSync('SELECT epoch FROM creative_execution_state')).toEqual(before);
    expect(db.getFirstSync("SELECT state FROM workflow_operations WHERE id='pending'")).toEqual({ state: 'PENDING' });
  } finally { db.close(); }
});
