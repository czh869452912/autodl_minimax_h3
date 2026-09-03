import { clearSchedulerLeasesForTests, withSchedulerLease } from './scheduler';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';

afterEach(() => clearSchedulerLeasesForTests());

test('does not run two same-key scheduler jobs at once', async () => {
  let release!: () => void;
  const first = withSchedulerLease('status', () => new Promise<string>((resolve) => { release = () => resolve('done'); }));
  const second = await withSchedulerLease('status', async () => 'duplicate');
  expect(second).toBeUndefined();
  release();
  await expect(first).resolves.toBe('done');
});

test('releases a lease after a failed job', async () => {
  await expect(withSchedulerLease('status', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  await expect(withSchedulerLease('status', async () => 'retry')).resolves.toBe('retry');
});

test('claims a database lease atomically and excludes a second executor', async () => {
  const db = createInitializedRealSqliteTestDb();
  let release!: () => void;
  try {
    const first = withSchedulerLease(
      'cas-gc',
      () => new Promise<string>((resolve) => { release = () => resolve('done'); }),
      { db: db as never, now: () => 100 },
    );
    await Promise.resolve();
    await expect(withSchedulerLease('cas-gc', async () => 'duplicate', {
      db: db as never,
      now: () => 101,
    })).resolves.toBeUndefined();
    release();
    await expect(first).resolves.toBe('done');
  } finally { db.close(); }
});
