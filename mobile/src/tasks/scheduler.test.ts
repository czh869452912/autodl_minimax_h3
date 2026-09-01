import { clearSchedulerLeasesForTests, withSchedulerLease } from './scheduler';

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
