import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createMonitorQueue } from './monitorQueue';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createExecutorWakeRepository } from './executorWakeRepository';

test('global notification stream excludes old events and never reuses cursors after deletion', async () => {
  const db = createInitializedRealSqliteTestDb();
  const add = (id: string, status: string) => db.runSync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES(?,?,0,'STATUS_RECONCILED',?,1)", id, id, JSON.stringify({ status }));
  try {
    const queue = createMonitorQueue(db as never);
    add('old', 'SUCCEEDED');
    const start = await queue.cursor();
    add('B', 'FAILED');
    add('C', 'RUNNING');
    const page = await queue.read(start);
    expect(page.events.map(e => e.taskId)).toEqual(['B']);
    expect(page.cursor).toBeGreaterThan(start);
    db.execSync('DELETE FROM workflow_job_events');
    expect(await queue.cursor()).toBe(page.cursor);
    add('D', 'SUCCEEDED');
    expect((await queue.read(page.cursor)).events.map(e => e.taskId)).toEqual(['D']);
  } finally { db.close(); }
});

test('new scheduled task and media work prevent idle stop, and unhandled wakes fence the final stop', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const queue = createMonitorQueue(db as never);
    const ops = createOperationRepository(db as never);
    const stop = jest.fn(async () => true);
    await ops.enqueue({ id: 'B', jobId: 'B', kind: 'STATUS_SYNC', idempotencyKey: 'B', payload: {}, now: Date.now(), nextRetryAt: Date.now() + 60000 });
    expect(await queue.stopIfIdle(0, stop)).toBe(false);
    db.execSync("UPDATE workflow_operations SET state='CLAIMED',lease_owner='other',lease_expires_at=9999999999999");
    expect(await queue.stopIfIdle(0, stop)).toBe(false);
    db.execSync('DELETE FROM workflow_operations');
    await ops.enqueue({ id: 'download', jobId: 'B', kind: 'ARTIFACT_DOWNLOAD', idempotencyKey: 'download', payload: {}, now: Date.now() });
    expect(await queue.stopIfIdle(0, stop)).toBe(false);
    db.execSync('DELETE FROM workflow_operations');
    const wakes = createExecutorWakeRepository(db as never);
    const wake = await wakes.requestWake(Date.now());
    expect(await queue.stopIfIdle(0, stop)).toBe(false);
    await wakes.acknowledge(wake.generation);
    expect(await queue.stopIfIdle(0, stop)).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  } finally { db.close(); }
});

test('notification draining is bounded and unread events prevent stopping', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const queue = createMonitorQueue(db as never);
    for (let i = 0; i < 70; i++) db.runSync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES(?,?,0,'cancelled','{}',1)", `e${i}`, `t${i}`);
    const first = await queue.read(0);
    expect(first.events).toHaveLength(64);
    expect(first.hasMore).toBe(true);
    const stop = jest.fn(async () => true);
    expect(await queue.stopIfIdle(first.cursor, stop)).toBe(false);
    const second = await queue.read(first.cursor);
    expect(second.events).toHaveLength(6);
    expect(await queue.stopIfIdle(second.cursor, stop)).toBe(true);
  } finally { db.close(); }
});
