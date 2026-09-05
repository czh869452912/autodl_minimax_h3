import type { SQLiteDatabase } from 'expo-sqlite';

export function isSqliteBusy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\bSQLITE_(?:BUSY|LOCKED)(?:_[A-Z]+)?\b|database (?:table )?is locked/i.test(message);
}

// Yield to the native writer/statement finalizer. A blocking busy_timeout on
// synchronous JS calls can prevent that writer from ever reaching COMMIT.
export async function retrySqliteBusy<T>(work: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 3000;
  for (let attempt = 0; ; attempt++) {
    try { return await work(); }
    catch (error) {
      if (!isSqliteBusy(error) || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(200, 20 * 2 ** Math.min(attempt, 4))));
    }
  }
}

// Retry the entire rolled-back transaction, never a single statement against
// a stale read snapshot. Callbacks must contain only transactional DB work or
// repeatable reads; network requests/publication stay outside this boundary.
export async function withWriteTransaction<T>(db: SQLiteDatabase, work: (txn: SQLiteDatabase) => Promise<T>): Promise<T> {
  return retrySqliteBusy(async () => {
    let result!: T;
    await db.withExclusiveTransactionAsync(async txn => { result = await work(txn); });
    return result;
  });
}

export function withRetryingQueries(db: SQLiteDatabase): SQLiteDatabase {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(db, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) {
        methods.set(key, ['runAsync', 'getFirstAsync', 'getAllAsync'].includes(String(key))
          ? (...args: unknown[]) => retrySqliteBusy(() => value.apply(target, args))
          : value.bind(target));
      }
      return methods.get(key);
    },
  });
}
