import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createOperationRepository } from './operationRepository';
import { createExecutorTick } from './tick';
import type { OperationKind } from './types';
import fs from 'fs';
import os from 'os';
import path from 'path';

function setup() {
  const db = createInitializedRealSqliteTestDb();
  const operations = createOperationRepository(db as never);
  const handled: string[] = [];
  const executor = {
    recover: jest.fn(async () => undefined),
    handle: jest.fn(async (operation, owner) => { handled.push(operation.id); await operations.finish(operation.id, owner, 'SUCCEEDED', 100); }),
  };
  const tick = createExecutorTick({ operations, executor, owner: () => 'worker', isReadonly: () => false });
  return { db, operations, executor, tick, handled };
}

function enqueue(operations: ReturnType<typeof createOperationRepository>, kind: OperationKind, index: number, nextRetryAt = 100) {
  operations.enqueue({ id: `${kind}-${index}`, kind, jobId: `job-${kind}-${index}`, idempotencyKey: `${kind}:${index}`, payload: {}, now: 100, nextRetryAt });
}

test('never exceeds maxOperations, is lane-fair, and defers newly-created work', async () => {
  const value = setup();
  try {
    for (const kind of ['SUBMIT', 'STATUS_SYNC', 'ARTIFACT_DOWNLOAD', 'EXPORT'] as const) for (let index = 0; index < 3; index += 1) enqueue(value.operations, kind, index);
    value.executor.handle.mockImplementation(async (operation, owner) => {
      value.handled.push(operation.id);
      value.operations.enqueue({ id: 'created-during-tick', kind: 'STATUS_SYNC', idempotencyKey: 'created:during', payload: {}, now: 100 });
      await value.operations.finish(operation.id, owner, 'SUCCEEDED', 100);
    });
    const summary = await value.tick.run({ reason: 'foreground', maxOperations: 4, now: 100 });
    expect(summary.claimed).toBe(4);
    expect(value.handled).toHaveLength(4);
    expect(value.handled).toEqual(expect.arrayContaining(['SUBMIT-0', 'STATUS_SYNC-0', 'ARTIFACT_DOWNLOAD-0', 'EXPORT-0']));
    expect(value.handled).not.toContain('created-during-tick');
  } finally { value.db.close(); }
});

test('filters future work and recovers before taking the due snapshot', async () => {
  const value = setup();
  try {
    enqueue(value.operations, 'STATUS_SYNC', 0, 101);
    expect(await value.tick.run({ reason: 'background', now: 100 })).toMatchObject({ claimed: 0, remainingDue: 0 });
    expect(value.executor.recover).toHaveBeenCalledWith(100);
  } finally { value.db.close(); }
});

test('uses bounded due and summary queries instead of the audit list API', async () => {
  const value = setup();
  try {
    enqueue(value.operations, 'STATUS_SYNC', 0);
    jest.spyOn(value.operations, 'list').mockImplementation(() => { throw new Error('full list scan'); });

    await expect(value.tick.run({ reason: 'foreground', now: 100 })).resolves.toMatchObject({ claimed: 1, succeeded: 1 });
  } finally { value.db.close(); }
});

test('work inserted during a running tick remains due for the next slice', async () => {
  const value = setup();
  let releaseHandler!: () => void;
  const handlerStarted = new Promise<void>((resolve) => {
    value.executor.handle.mockImplementationOnce(async (operation, owner) => {
      resolve();
      await new Promise<void>((release) => { releaseHandler = release; });
      await value.operations.finish(operation.id, owner, 'SUCCEEDED', 100);
    });
  });
  try {
    enqueue(value.operations, 'STATUS_SYNC', 0);
    const running = value.tick.run({ reason: 'foreground', now: 100 });
    await handlerStarted;
    enqueue(value.operations, 'STATUS_SYNC', 1);
    releaseHandler();

    await expect(running).resolves.toMatchObject({ claimed: 1, succeeded: 1, remainingDue: 1 });
    expect(value.handled).not.toContain('STATUS_SYNC-1');

    await expect(value.tick.run({ reason: 'foreground', now: 100 })).resolves.toMatchObject({ claimed: 1, succeeded: 1, remainingDue: 0 });
  } finally { value.db.close(); }
});

test('overlapping entrypoints execute independent passes and thrown handlers release claims', async () => {
  const value = setup();
  try {
    enqueue(value.operations, 'STATUS_SYNC', 0);
    value.executor.handle.mockRejectedValueOnce(new Error('handler failed'));
    const first = value.tick.run({ reason: 'foreground', now: 100 });
    const second = value.tick.run({ reason: 'service', now: 100 });
    await Promise.all([first, second]);
    expect(value.executor.recover).toHaveBeenCalledTimes(2);
    expect(value.executor.handle).toHaveBeenCalledTimes(1);
    expect(await value.operations.get('STATUS_SYNC-0')).toMatchObject({ state: 'PENDING' });
  } finally { value.db.close(); }
});

test('caps a tick at eight operations even when a larger limit is requested', async () => {
  const value = setup();
  try {
    for (let index = 0; index < 10; index += 1) enqueue(value.operations, 'STATUS_SYNC', index);

    await expect(value.tick.run({ reason: 'foreground', maxOperations: 99, now: 100 })).resolves.toMatchObject({
      claimed: 8,
      succeeded: 8,
      remainingDue: 2,
    });
  } finally { value.db.close(); }
});

test('readonly mode skips recovery, claims, and handlers', async () => {
  const value = setup();
  try {
    enqueue(value.operations, 'SUBMIT', 0);
    const tick = createExecutorTick({ operations: value.operations, executor: value.executor, owner: () => 'worker', isReadonly: () => true });
    expect(await tick.run({ reason: 'foreground', now: 100 })).toEqual({
      claimed: 0,
      succeeded: 0,
      retried: 0,
      failed: 0,
      blocked: 0,
      remainingDue: 1,
      remainingScheduled: 0,
    });
    expect(value.executor.recover).not.toHaveBeenCalled();
    expect(value.executor.handle).not.toHaveBeenCalled();
  } finally { value.db.close(); }
});

test('expired leases and retry timestamps survive a real database reopen', async () => {
  const file = path.join(os.tmpdir(), `autodl-h3-tick-${process.pid}-${Date.now()}.db`);
  try {
    const firstDb = createInitializedRealSqliteTestDb(file);
    const first = createOperationRepository(firstDb as never);
    enqueue(first, 'STATUS_SYNC', 0);
    enqueue(first, 'STATUS_SYNC', 1, 500);
    await first.claimDue({ kind: 'STATUS_SYNC', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    firstDb.close();

    const secondDb = createInitializedRealSqliteTestDb(file);
    try {
      const reopened = createOperationRepository(secondDb as never);
      const handled: string[] = [];
      const executor = {
        recover: jest.fn(async (now: number) => { await reopened.recoverExpired(now, 32); }),
        handle: jest.fn(async (operation, owner) => { handled.push(operation.id); await reopened.finish(operation.id, owner, 'SUCCEEDED', 151); }),
      };
      const tick = createExecutorTick({ operations: reopened, executor, owner: () => 'restart', isReadonly: () => false });
      await tick.run({ reason: 'background', now: 151 });
      expect(handled).toEqual(['STATUS_SYNC-0']);
      expect(await reopened.get('STATUS_SYNC-1')).toMatchObject({ state: 'PENDING', nextRetryAt: 500 });
    } finally { secondDb.close(); }
  } finally {
    fs.rmSync(file, { force: true });
  }
});
