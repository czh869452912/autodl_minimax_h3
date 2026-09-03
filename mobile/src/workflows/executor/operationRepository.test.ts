import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createOperationRepository } from './operationRepository';

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

test('returns one operation for a duplicate kind and idempotency key', () => {
  const { db, repository } = setup();
  try {
    const first = enqueue(repository, { kind: 'SUBMIT', idempotencyKey: 'submit:job-1' });
    const duplicate = enqueue(repository, { id: 'op-2', kind: 'SUBMIT', idempotencyKey: 'submit:job-1', now: 101 });
    expect(duplicate.id).toBe(first.id);
    expect(repository.list()).toHaveLength(1);
  } finally { db.close(); }
});

test('claims only due work in deterministic order and respects the limit', () => {
  const { db, repository } = setup();
  try {
    enqueue(repository, { id: 'later-created', idempotencyKey: 'later-created', now: 101, nextRetryAt: 100 });
    enqueue(repository, { id: 'first', idempotencyKey: 'first', now: 100, nextRetryAt: 100 });
    enqueue(repository, { id: 'not-due', idempotencyKey: 'not-due', now: 99, nextRetryAt: 201 });
    expect(repository.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 200, leaseMs: 50, limit: 1 }))
      .toMatchObject([{ id: 'first', attempt: 1, leaseOwner: 'worker', leaseExpiresAt: 250 }]);
    expect(repository.claimDue({ kind: 'STATUS_SYNC', owner: 'worker', now: 200, leaseMs: 50, limit: 5 }))
      .toMatchObject([{ id: 'later-created' }]);
  } finally { db.close(); }
});

test('only the lease owner can renew, release, retry, or finish', () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    repository.claimDue({ kind: 'STATUS_SYNC', owner: 'a', now: 100, leaseMs: 50, limit: 1 });
    expect(repository.renew('op-1', 'b', 120, 50)).toBe(false);
    expect(repository.release('op-1', 'b', 120)).toBe(false);
    expect(repository.retry('op-1', 'b', { now: 120, nextRetryAt: 140 })).toBe(false);
    expect(repository.finish('op-1', 'b', 'SUCCEEDED', 120)).toBe(false);
    expect(repository.renew('op-1', 'a', 120, 50)).toBe(true);
    expect(repository.release('op-1', 'a', 121)).toBe(true);
    expect(repository.get('op-1')).toMatchObject({ state: 'PENDING' });
    expect(repository.get('op-1')).not.toHaveProperty('leaseOwner');
    expect(repository.get('op-1')).not.toHaveProperty('leaseExpiresAt');
  } finally { db.close(); }
});

test('contention yields one owner and attempts increment on each successful claim', () => {
  const { db, repository } = setup();
  const contender = createOperationRepository(db as never);
  try {
    enqueue(repository);
    expect(repository.claimDue({ kind: 'STATUS_SYNC', owner: 'a', now: 100, leaseMs: 50, limit: 1 })).toHaveLength(1);
    expect(contender.claimDue({ kind: 'STATUS_SYNC', owner: 'b', now: 100, leaseMs: 50, limit: 1 })).toEqual([]);
    expect(repository.release('op-1', 'a', 110)).toBe(true);
    expect(contender.claimDue({ kind: 'STATUS_SYNC', owner: 'b', now: 110, leaseMs: 50, limit: 1 }))
      .toMatchObject([{ attempt: 2, leaseOwner: 'b' }]);
  } finally { db.close(); }
});

test('retry and finish clear lease ownership and persist normalized failure', () => {
  const { db, repository } = setup();
  try {
    enqueue(repository);
    repository.claimDue({ kind: 'STATUS_SYNC', owner: 'a', now: 100, leaseMs: 50, limit: 1 });
    expect(repository.retry('op-1', 'a', { now: 120, nextRetryAt: 500, error: { code: 'HTTP_503', message: 'retry', retryable: true } })).toBe(true);
    expect(repository.get('op-1')).toMatchObject({ state: 'PENDING', nextRetryAt: 500, lastError: { code: 'HTTP_503' } });
    expect(repository.get('op-1')).not.toHaveProperty('leaseOwner');
    repository.claimDue({ kind: 'STATUS_SYNC', owner: 'b', now: 500, leaseMs: 50, limit: 1 });
    expect(repository.finish('op-1', 'b', 'FAILED', 510, { code: 'HTTP_422', message: 'invalid' })).toBe(true);
    expect(repository.get('op-1')).toMatchObject({ state: 'FAILED', lastError: { code: 'HTTP_422' } });
    expect(repository.get('op-1')).not.toHaveProperty('leaseOwner');
  } finally { db.close(); }
});

test('expired safe work is requeued while expired submits require job-aware recovery', () => {
  const { db, repository } = setup();
  try {
    enqueue(repository, { id: 'status', idempotencyKey: 'status' });
    enqueue(repository, { id: 'submit', kind: 'SUBMIT', idempotencyKey: 'submit' });
    repository.claimDue({ kind: 'STATUS_SYNC', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    repository.claimDue({ kind: 'SUBMIT', owner: 'dead', now: 100, leaseMs: 50, limit: 1 });
    expect(repository.recoverExpired(151)).toMatchObject([{ id: 'submit', kind: 'SUBMIT', state: 'CLAIMED' }]);
    expect(repository.get('status')).toMatchObject({ state: 'PENDING' });
    expect(repository.get('status')).not.toHaveProperty('leaseOwner');
    expect(repository.get('status')).not.toHaveProperty('leaseExpiresAt');
    expect(repository.get('submit')).toMatchObject({ state: 'CLAIMED', leaseOwner: 'dead' });
  } finally { db.close(); }
});
