import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createOperationRepository } from './operationRepository';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setup() {
  const db = createInitializedRealSqliteTestDb();
  return { db, repository: createOperationRepository(db as never) };
}

const enqueue = (repository: ReturnType<typeof createOperationRepository>, overrides: Partial<Parameters<typeof repository.enqueue>[0]> = {}) => repository.enqueue({
  id: 'op-1',
  kind: 'STATUS_SYNC',
  jobId: 'job-1',
  idempotencyKey: 'status:job-1:0',
  payload: { jobId: 'job-1' },
  now: 100,
  ...overrides,
});

test('returns one operation for a duplicate kind and idempotency key', async () => {
  const { db, repository } = setup();
  try {
    const first = enqueue(repository, { kind: 'SUBMIT', idempotencyKey: 'submit:job-1' });
    const duplicate = enqueue(repository, { id: 'op-2', kind: 'SUBMIT', idempotencyKey: 'submit:job-1', now: 101 });
    expect(duplicate.id).toBe(first.id);
    expect(repository.list()).toHaveLength(1);
  } finally { db.close(); }
});

test('claims only due work in deterministic order and respects the limit', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository, { id: 'later-created', idempotencyKey: 'later-created', now: 101, nextRetryAt: 100 });
    enqueue(repository, { id: 'first', idempotencyKey: 'first', now: 100, nextRetryAt: 100 });
    enqueue(repository, { id: 'not-due', idempotencyKey: 'not-due', now: 99, nextRetryAt: 201 });
    expect(await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 200, leaseMs: 50, limit: 1 }))
      .toMatchObject([{ id: 'first', attempt: 1, leaseOwner: 'worker', leaseExpiresAt: 250 }]);
    expect(await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 200, leaseMs: 50, limit: 5 }))
      .toMatchObject([{ id: 'later-created' }]);
  } finally { db.close(); }
});

test('only the lease owner can renew, release, retry, or finish', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'a', now: 100, leaseMs: 50, limit: 1 });
    expect(await repository.renew('op-1', 'b', 120, 50)).toBe(false);
    expect(await repository.release('op-1', 'b', 120)).toBe(false);
    expect(await repository.retry('op-1', 'b', { now: 120, nextRetryAt: 140 })).toBe(false);
    expect(await repository.finish('op-1', 'b', 'SUCCEEDED', 120)).toBe(false);
    expect(await repository.renew('op-1', 'a', 120, 50)).toBe(true);
    expect(await repository.release('op-1', 'a', 121)).toBe(true);
    expect(await repository.get('op-1')).toMatchObject({ state: 'PENDING' });
    expect(await repository.get('op-1')).not.toHaveProperty('leaseOwner');
    expect(await repository.get('op-1')).not.toHaveProperty('leaseExpiresAt');
  } finally { db.close(); }
});

test('contention yields one owner and attempts increment on each successful claim', async () => {
  const { db, repository } = setup();
  const contender = createOperationRepository(db as never);
  try {
    enqueue(repository);
    expect(await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'a', now: 100, leaseMs: 50, limit: 1 })).toHaveLength(1);
    expect(await contender.claimDue({ kind: 'STATUS_SYNC', owner: 'b', now: 100, leaseMs: 50, limit: 1 })).toEqual([]);
    expect(await repository.release('op-1', 'a', 110)).toBe(true);
    expect(await contender.claimDue({ kind: 'STATUS_SYNC', owner: 'b', now: 110, leaseMs: 50, limit: 1 }))
      .toMatchObject([{ attempt: 2, leaseOwner: 'b' }]);
  } finally { db.close(); }
});

test('retry and finish clear lease ownership and persist normalized failure', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'a', now: 100, leaseMs: 50, limit: 1 });
    expect(await repository.retry('op-1', 'a', { now: 120, nextRetryAt: 500, error: { code: 'HTTP_503', message: 'retry', retryable: true } })).toBe(true);
    expect(await repository.get('op-1')).toMatchObject({ state: 'PENDING', nextRetryAt: 500, lastError: { code: 'HTTP_503' } });
    expect(await repository.get('op-1')).not.toHaveProperty('leaseOwner');
    await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'b', now: 500, leaseMs: 50, limit: 1 });
    expect(await repository.finish('op-1', 'b', 'FAILED', 510, { code: 'HTTP_422', message: 'invalid' })).toBe(true);
    expect(await repository.get('op-1')).toMatchObject({ state: 'FAILED', lastError: { code: 'HTTP_422' } });
    expect(await repository.get('op-1')).not.toHaveProperty('leaseOwner');
  } finally { db.close(); }
});

test('expired safe work is requeued while expired submits require job-aware recovery', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository, { id: 'status', idempotencyKey: 'status' });
    enqueue(repository, { id: 'submit', kind: 'SUBMIT', idempotencyKey: 'submit' });
    await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    await repository.claimDue({ kind: 'SUBMIT', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    expect(await repository.recoverExpired(151, 32)).toMatchObject({
      uncertainSubmits: [{ id: 'submit', kind: 'SUBMIT', state: 'CLAIMED' }],
      reopened: 1,
      hasMore: false,
    });
    expect(await repository.get('status')).toMatchObject({ state: 'PENDING' });
    expect(await repository.get('status')).not.toHaveProperty('leaseOwner');
    expect(await repository.get('status')).not.toHaveProperty('leaseExpiresAt');
    expect(await repository.get('submit')).toMatchObject({ state: 'CLAIMED', leaseOwner: 'dead' });
  } finally { db.close(); }
});

test('countOutstanding observes claimed work from another database connection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'operation-repository-'));
  const path = join(directory, 'operations.db');
  const claimantDb = createInitializedRealSqliteTestDb(path);
  const observerDb = createInitializedRealSqliteTestDb(path);
  const claimant = createOperationRepository(claimantDb as never);
  const observer = createOperationRepository(observerDb as never);
  try {
    enqueue(claimant, { jobId: 'job-a' });
    expect(await claimant.claimDue({ kind: 'STATUS_SYNC', owner: 'worker-a', now: 100, leaseMs: 1_000, limit: 1 }))
      .toMatchObject([{ id: 'op-1', state: 'CLAIMED' }]);

    expect(await observer.pendingSummary({ now: 100, jobIds: ['job-a'] })).toEqual({ remainingDue: 0, remainingScheduled: 0 });
    expect(await observer.countOutstanding(['job-a'])).toBe(1);
  } finally {
    observerDb.close();
    claimantDb.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('queries bounded due work and aggregates pending state without scanning terminal history', async () => {
  const { db, repository } = setup();
  try {
    for (let index = 0; index < 100; index += 1) {
      enqueue(repository, { id: `terminal-${index}`, idempotencyKey: `terminal-${index}`, jobId: 'old-job', now: index });
      await repository.claimById(`terminal-${index}`, 'worker', 1_000, 10);
      await repository.finish(`terminal-${index}`, 'worker', 'SUCCEEDED', 1_000);
    }
    enqueue(repository, { id: 'due-a', idempotencyKey: 'due-a', jobId: 'job-a', nextRetryAt: 900 });
    enqueue(repository, { id: 'due-b', idempotencyKey: 'due-b', jobId: 'job-b', nextRetryAt: 950 });
    enqueue(repository, { id: 'artifact-due', kind: 'ARTIFACT_DOWNLOAD', idempotencyKey: 'artifact-due', jobId: 'job-b', nextRetryAt: 700 });
    enqueue(repository, { id: 'scheduled-a', idempotencyKey: 'scheduled-a', jobId: 'job-a', nextRetryAt: 1_200 });
    enqueue(repository, { id: 'leased-a', idempotencyKey: 'leased-a', jobId: 'job-a', nextRetryAt: 800 });
    db.runSync("UPDATE workflow_operations SET lease_owner='other', lease_expires_at=1100 WHERE id='leased-a'");

    expect(await repository.listDue({ kind: 'STATUS_SYNC', now: 1_000, limit: 1 })).toMatchObject([{ id: 'due-a' }]);
    expect(await repository.pendingSummary({ now: 1_000 })).toEqual({ remainingDue: 3, remainingScheduled: 2, nextWakeAt: 1_100 });
    expect(await repository.pendingSummary({ now: 1_000, jobIds: ['job-a'] })).toEqual({ remainingDue: 1, remainingScheduled: 2, nextWakeAt: 1_100 });
    expect(await repository.pendingSummary({ now: 1_000, jobIds: [] })).toEqual({ remainingDue: 0, remainingScheduled: 0 });
    expect(await repository.countOutstanding(['job-a'])).toBe(3);
    expect(await repository.countOutstanding([])).toBe(0);
  } finally { db.close(); }
});

test('expedites only retryable network operations in the requested job scope', async () => {
  const { db, repository } = setup();
  try {
    const seed = (id: string, kind: 'SUBMIT' | 'STATUS_SYNC' | 'ARTIFACT_DOWNLOAD', jobId: string, error: object, state = 'PENDING') => {
      enqueue(repository, { id, kind, jobId, idempotencyKey: id, nextRetryAt: 5_000 });
      db.runSync('UPDATE workflow_operations SET state=?, last_error_json=? WHERE id=?', state, JSON.stringify(error), id);
    };
    seed('network', 'STATUS_SYNC', 'job-a', { code: 'AUTODL_STATUS_NETWORK', message: 'offline', retryable: true });
    seed('timeout', 'STATUS_SYNC', 'job-a', { code: 'AUTODL_STATUS_TIMEOUT', message: 'timeout', retryable: true });
    seed('artifact-network', 'ARTIFACT_DOWNLOAD', 'job-a', { code: 'ARTIFACT_NETWORK', message: 'offline', retryable: true });
    seed('artifact-timeout', 'ARTIFACT_DOWNLOAD', 'job-a', { code: 'ARTIFACT_IDLE_TIMEOUT', message: 'timeout', retryable: true });
    seed('unknown-submit', 'SUBMIT', 'job-a', { code: 'AUTODL_SUBMIT_TIMEOUT', message: 'unknown', retryable: true });
    seed('auth', 'STATUS_SYNC', 'job-a', { code: 'AUTODL_STATUS_AUTH_401', message: 'auth', retryable: false });
    seed('terminal', 'STATUS_SYNC', 'job-a', { code: 'AUTODL_STATUS_NETWORK', message: 'offline', retryable: true }, 'FAILED');
    seed('other-job', 'STATUS_SYNC', 'job-b', { code: 'AUTODL_STATUS_NETWORK', message: 'offline', retryable: true });

    expect(await repository.expediteRetryableNetwork(['job-a'], 1_000)).toBe(4);
    for (const id of ['network', 'timeout', 'artifact-network', 'artifact-timeout']) expect((await repository.get(id))?.nextRetryAt).toBe(1_000);
    for (const id of ['unknown-submit', 'auth', 'terminal', 'other-job']) expect((await repository.get(id))?.nextRetryAt).toBe(5_000);
  } finally { db.close(); }
});

test('recovers no more than the requested batch and reports trailing expired claims', async () => {
  const { db, repository } = setup();
  try {
    for (let index = 0; index < 33; index += 1) {
      enqueue(repository, { id: `expired-${index}`, idempotencyKey: `expired-${index}` });
    }
    expect(await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'dead', now: 100, leaseMs: 50, limit: 33 })).toHaveLength(33);

    expect(await repository.recoverExpired(151, 32)).toEqual({ uncertainSubmits: [], reopened: 32, hasMore: true });
    expect(repository.list().filter((operation) => operation.state === 'CLAIMED')).toHaveLength(1);
    expect(await repository.recoverExpired(151, 32)).toEqual({ uncertainSubmits: [], reopened: 1, hasMore: false });
  } finally { db.close(); }
});

test('hot-path reads do not require synchronous database APIs', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    jest.spyOn(db, 'getFirstSync').mockImplementation(() => { throw new Error('sync database access is unavailable'); });
    await expect(repository.get('op-1')).resolves.toMatchObject({ id: 'op-1' });
  } finally { db.close(); }
});

test('executor hot writes work when synchronous recovery reads are unavailable', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository, { id: 'due-claim', idempotencyKey: 'due-claim' });
    enqueue(repository, { id: 'by-id', idempotencyKey: 'by-id', now: 101, nextRetryAt: 100 });
    enqueue(repository, { id: 'expired', idempotencyKey: 'expired', now: 102, nextRetryAt: 100 });
    const syncRecoveryRead = jest.spyOn(db, 'getFirstSync').mockImplementation(() => { throw new Error('sync database access is unavailable'); });

    expect(await repository.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 100, leaseMs: 50, limit: 1 })).toHaveLength(1);
    expect(await repository.release('due-claim', 'worker', 101)).toBe(true);

    expect(await repository.claimById('by-id', 'worker', 100, 50)).toMatchObject({ leaseOwner: 'worker' });
    expect(await repository.renew('by-id', 'worker', 110, 50)).toBe(true);
    expect(await repository.retry('by-id', 'worker', { now: 111, nextRetryAt: 120 })).toBe(true);
    expect(await repository.claimById('by-id', 'worker', 120, 50)).toMatchObject({ attempt: 2 });
    expect(await repository.finish('by-id', 'worker', 'SUCCEEDED', 121)).toBe(true);

    expect(await repository.claimById('expired', 'worker', 100, 50)).toMatchObject({ state: 'CLAIMED' });
    expect(await repository.recoverExpired(151, 32)).toEqual({ uncertainSubmits: [], reopened: 1, hasMore: false });
    expect(syncRecoveryRead).not.toHaveBeenCalled();
  } finally { db.close(); }
});

test('does not claim when an asynchronous recovery-state read fails', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    const originalGetFirstAsync = db.getFirstAsync.bind(db);
    const readRecovery = jest.spyOn(db, 'getFirstAsync').mockImplementation(async (source: string, ...params: unknown[]) => {
      if (source.includes('app_database_recovery')) throw new Error('recovery-state unavailable');
      return originalGetFirstAsync(source, ...params);
    });

    await expect(repository.claimById('op-1', 'worker', 100, 50)).rejects.toThrow('recovery-state unavailable');
    readRecovery.mockRestore();
    await expect(repository.get('op-1')).resolves.toMatchObject({ state: 'PENDING', attempt: 0 });
  } finally { db.close(); }
});

test('rejects a claim when a contender changes its row after the claim transaction', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    const runExclusive = db.withExclusiveTransactionAsync.bind(db);
    jest.spyOn(db, 'withExclusiveTransactionAsync').mockImplementation(async (work) => {
      await runExclusive(work);
      db.runSync(
        "UPDATE workflow_operations SET lease_owner = 'contender', lease_expires_at = 999 WHERE id = 'op-1'",
      );
    });

    await expect(repository.claimById('op-1', 'worker', 100, 50)).rejects.toThrow('OPERATION_CLAIM_FENCE_MISMATCH');
    await expect(repository.get('op-1')).resolves.toMatchObject({ leaseOwner: 'contender', leaseExpiresAt: 999 });
  } finally { db.close(); }
});

test('rejects a claim when its post-CAS row no longer has the owner fence', async () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    const runExclusive = db.withExclusiveTransactionAsync.bind(db);
    const getFirstAsync = db.getFirstAsync.bind(db);
    let insideExclusive = false;
    jest.spyOn(db, 'withExclusiveTransactionAsync').mockImplementation(async (work) => {
      await runExclusive(async (transaction) => {
        insideExclusive = true;
        try {
          await work(transaction);
        } finally {
          insideExclusive = false;
        }
      });
    });
    jest.spyOn(db, 'getFirstAsync').mockImplementation(async (source: string, ...params: unknown[]) => {
      const row = await getFirstAsync(source, ...params);
      if (insideExclusive && source.includes('RETURNING') && row) {
        return { ...row, lease_owner: 'contender' };
      }
      return row;
    });

    await expect(repository.claimById('op-1', 'worker', 100, 50)).rejects.toThrow('OPERATION_CLAIM_FENCE_MISMATCH');
    await expect(repository.get('op-1')).resolves.toMatchObject({ state: 'PENDING', attempt: 0 });
  } finally { db.close(); }
});

