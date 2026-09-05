import { assertAppDatabaseWritable, assertAppDatabaseWritableAsync } from '../storage/database';
import type { SQLiteDatabase } from 'expo-sqlite';

export async function withAsyncSchedulerLease<T>(
  key: string,
  work: (lease: { assertOwned(): Promise<void> }) => Promise<T>,
  options: { db: SQLiteDatabase; now?: () => number; ttlMs?: number },
): Promise<T | undefined> {
  const { db } = options;
  const now = options.now ?? Date.now;
  const ttl = Math.max(5000, options.ttlMs ?? 120000);
  const owner = `${now()}-${Math.random()}`;
  await assertAppDatabaseWritableAsync(db);
  if (changes(await db.runAsync(`INSERT INTO app_scheduler_leases(lease_key,owner,expires_at) VALUES(?,?,?)
    ON CONFLICT(lease_key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE app_scheduler_leases.expires_at<=?`,
  key, owner, now() + ttl, now())) !== 1) return undefined;
  let renewal: Promise<void> | undefined;
  let failure: unknown;
  const assertOwned = async () => {
    if (renewal) await renewal;
    if (failure) throw failure;
    const row = await db.getFirstAsync('SELECT 1 FROM app_scheduler_leases WHERE lease_key=? AND owner=? AND expires_at>?', key, owner, now());
    if (!row) throw new Error('SCHEDULER_LEASE_LOST');
  };
  const timer = setInterval(() => {
    if (renewal) return;
    renewal = (async () => {
      if (changes(await db.runAsync('UPDATE app_scheduler_leases SET expires_at=? WHERE lease_key=? AND owner=? AND expires_at>?', now() + ttl, key, owner, now())) !== 1) throw new Error('SCHEDULER_LEASE_LOST');
    })().catch(error => { failure = error; }).finally(() => { renewal = undefined; });
  }, Math.floor(ttl / 3));
  try {
    const result = await work({ assertOwned });
    await assertOwned();
    return result;
  } finally {
    clearInterval(timer);
    if (renewal) await renewal;
    await db.runAsync('DELETE FROM app_scheduler_leases WHERE lease_key=? AND owner=?', key, owner);
  }
}

type LeaseDb = {
  runSync?: (sql: string, ...params: any[]) => unknown;
};

export type SchedulerLease = {
  key: string;
  owner: string;
  assertOwned(): void;
  renew(): void;
};

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

const localLeases = new Map<string, { owner: string; expiresAt: number }>();

export async function withSchedulerLease<T>(
  key: string,
  work: (lease: SchedulerLease) => Promise<T>,
  options: { db?: LeaseDb; now?: () => number; ttlMs?: number } = {},
): Promise<T | undefined> {
  const now = options.now ?? Date.now;
  const ttlMs = Math.max(5_000, options.ttlMs ?? 120_000);
  const timestamp = now();
  const db = options.db;
  const owner = `${timestamp}-${Math.random()}`;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let leaseError: Error | undefined;
  let lease: SchedulerLease;
  if (db?.runSync) {
    assertAppDatabaseWritable(db as never);
    const claimed = db.runSync(
      'INSERT INTO app_scheduler_leases (lease_key,owner,expires_at) VALUES (?,?,?) ON CONFLICT(lease_key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE app_scheduler_leases.expires_at <= ?',
      key, owner, timestamp + ttlMs, timestamp,
    );
    if (changes(claimed) !== 1) return undefined;
    const assertOwned = () => {
      if (leaseError) throw leaseError;
      const result = db.runSync!(
        'UPDATE app_scheduler_leases SET expires_at=expires_at WHERE lease_key=? AND owner=? AND expires_at>?',
        key, owner, now(),
      );
      if (changes(result) !== 1) throw new Error('SCHEDULER_LEASE_LOST');
    };
    const renew = () => {
      if (leaseError) throw leaseError;
      const renewalTime = now();
      const result = db.runSync!(
        'UPDATE app_scheduler_leases SET expires_at=? WHERE lease_key=? AND owner=? AND expires_at>?',
        renewalTime + ttlMs, key, owner, renewalTime,
      );
      if (changes(result) !== 1) throw new Error('SCHEDULER_LEASE_LOST');
    };
    lease = { key, owner, assertOwned, renew };
    heartbeat = setInterval(() => {
      try { renew(); } catch (reason) {
        leaseError = reason instanceof Error ? reason : new Error('SCHEDULER_LEASE_LOST');
      }
    }, Math.max(1_000, Math.floor(ttlMs / 3)));
  } else {
    const current = localLeases.get(key);
    if (current && current.expiresAt > timestamp) return undefined;
    localLeases.set(key, { owner, expiresAt: timestamp + ttlMs });
    lease = {
      key,
      owner,
      assertOwned() {
        const active = localLeases.get(key);
        if (!active || active.owner !== owner || active.expiresAt <= now()) {
          throw new Error('SCHEDULER_LEASE_LOST');
        }
      },
      renew() {
        const renewalTime = now();
        const active = localLeases.get(key);
        if (!active || active.owner !== owner || active.expiresAt <= renewalTime) {
          throw new Error('SCHEDULER_LEASE_LOST');
        }
        localLeases.set(key, { owner, expiresAt: renewalTime + ttlMs });
      },
    };
    heartbeat = setInterval(() => {
      try { lease.renew(); } catch (reason) {
        leaseError = reason instanceof Error ? reason : new Error('SCHEDULER_LEASE_LOST');
      }
    }, Math.max(1_000, Math.floor(ttlMs / 3)));
  }
  try {
    const result = await work(lease);
    lease.assertOwned();
    return result;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (db?.runSync) db.runSync('DELETE FROM app_scheduler_leases WHERE lease_key = ? AND owner = ?', key, owner);
    else if (localLeases.get(key)?.owner === owner) localLeases.delete(key);
  }
}

export function clearSchedulerLeasesForTests(): void {
  localLeases.clear();
}
