import { retrySqliteBusy, withWriteTransaction, withRetryingQueries } from './sqliteBusy';

afterEach(() => jest.useRealTimers());

test('restarts the whole transaction after a rolled-back commit conflict', async () => {
  const snapshots: number[] = [];
  let attempts = 0;
  const db = { withExclusiveTransactionAsync: async (work: (txn: unknown) => Promise<void>) => {
    await work({ revision: ++attempts });
    if (attempts === 1) throw new Error("NativeDatabase.execAsync rejected: database is locked");
  } };
  const result = await withWriteTransaction(db as never, async txn => {
    const revision = (txn as unknown as { revision: number }).revision;
    snapshots.push(revision); return revision;
  });
  expect(result).toBe(2);
  expect(snapshots).toEqual([1, 2]);
});

test('only lock errors retry, and persistent contention has a bounded deadline', async () => {
  jest.useFakeTimers();
  const locked = jest.fn(async () => { throw new Error('database is locked'); });
  const pending = expect(retrySqliteBusy(locked)).rejects.toThrow('database is locked');
  await jest.advanceTimersByTimeAsync(4000);
  await pending;
  expect(locked.mock.calls.length).toBeLessThan(25);
  const other = jest.fn(async () => { throw new Error('disk full'); });
  await expect(retrySqliteBusy(other)).rejects.toThrow('disk full');
  expect(other).toHaveBeenCalledTimes(1);
});

test('standalone queries retry but exclusive transactions receive the original native transaction handle', async () => {
  let calls = 0;
  const txn = { getFirstAsync: jest.fn() };
  const native = {
    getFirstAsync: async () => { if (++calls === 1) throw new Error('SQLITE_BUSY'); return 42; },
    withExclusiveTransactionAsync: async (work: (t: unknown) => Promise<void>) => work(txn),
  };
  const db = withRetryingQueries(native as never);
  expect(await db.getFirstAsync('SELECT 42')).toBe(42);
  await db.withExclusiveTransactionAsync(async t => { expect(t).toBe(txn); });
  expect(db.getFirstAsync).toBe(db.getFirstAsync);
});
