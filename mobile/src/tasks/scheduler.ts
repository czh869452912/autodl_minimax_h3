import { assertAppDatabaseWritable } from '../storage/database';

type LeaseDb = {
  runSync?: (sql: string, ...params: any[]) => unknown;
};

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

const localLeases = new Map<string, number>();

export async function withSchedulerLease<T>(
  key: string,
  work: () => Promise<T>,
  options: { db?: LeaseDb; now?: () => number; ttlMs?: number } = {},
): Promise<T | undefined> {
  const now = options.now ?? Date.now;
  const ttlMs = Math.max(5_000, options.ttlMs ?? 120_000);
  const timestamp = now();
  const db = options.db;
  const owner = `${timestamp}-${Math.random()}`;
  if (db?.runSync) {
    assertAppDatabaseWritable(db as never);
    const claimed = db.runSync(
      'INSERT INTO app_scheduler_leases (lease_key,owner,expires_at) VALUES (?,?,?) ON CONFLICT(lease_key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE app_scheduler_leases.expires_at <= ?',
      key, owner, timestamp + ttlMs, timestamp,
    );
    if (changes(claimed) !== 1) return undefined;
  } else {
    const expiresAt = localLeases.get(key) ?? 0;
    if (expiresAt > timestamp) return undefined;
    localLeases.set(key, timestamp + ttlMs);
  }
  try {
    return await work();
  } finally {
    if (db?.runSync) db.runSync('DELETE FROM app_scheduler_leases WHERE lease_key = ? AND owner = ?', key, owner);
    else localLeases.delete(key);
  }
}

export function clearSchedulerLeasesForTests(): void {
  localLeases.clear();
}
