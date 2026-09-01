type LeaseDb = {
  getFirstSync?: (sql: string, ...params: unknown[]) => { expires_at?: number } | null;
  runSync?: (sql: string, ...params: unknown[]) => unknown;
};

const localLeases = new Map<string, number>();
const initializedDatabases = new WeakSet<object>();

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
  if (db?.getFirstSync && db.runSync) {
    if (!initializedDatabases.has(db as object)) {
      db.runSync('CREATE TABLE IF NOT EXISTS app_scheduler_leases (lease_key TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)');
      initializedDatabases.add(db as object);
    }
    const current = db.getFirstSync('SELECT expires_at FROM app_scheduler_leases WHERE lease_key = ? LIMIT 1', key);
    if (current && Number(current.expires_at) > timestamp) return undefined;
    db.runSync('INSERT OR REPLACE INTO app_scheduler_leases (lease_key, owner, expires_at) VALUES (?, ?, ?)', key, owner, timestamp + ttlMs);
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
