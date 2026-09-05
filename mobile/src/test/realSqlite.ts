import { DatabaseSync } from 'node:sqlite';

let exclusiveTestTransactionTail = Promise.resolve();

export function createRealSqliteTestDb(path = ':memory:', options: { independentTransactions?: boolean } = {}) {
  const database = new DatabaseSync(path);
  const values = (params: unknown[]) => params as Parameters<ReturnType<DatabaseSync['prepare']>['run']>;
  let transactionTarget: unknown;
  const api = {
    execSync(source: string) { database.exec(source); },
    async execAsync(source: string) { database.exec(source); },
    runSync(source: string, ...params: unknown[]) { return database.prepare(source).run(...values(params)); },
    async runAsync(source: string, ...params: unknown[]) { return database.prepare(source).run(...values(params)); },
    getFirstSync<T>(source: string, ...params: unknown[]) { return database.prepare(source).get(...values(params)) as T | undefined; },
    async getFirstAsync<T>(source: string, ...params: unknown[]) { return database.prepare(source).get(...values(params)) as T | undefined; },
    getAllSync<T>(source: string, ...params: unknown[]) { return database.prepare(source).all(...values(params)) as T[]; },
    async getAllAsync<T>(source: string, ...params: unknown[]) { return database.prepare(source).all(...values(params)) as T[]; },
    async withExclusiveTransactionAsync(task: (txn: unknown) => Promise<void>) {
      if (options.independentTransactions) {
        if (path === ':memory:') throw new Error('independent transactions require a file database');
        const txn = createRealSqliteTestDb(path);
        try {
          txn.execSync('BEGIN');
          await task(txn);
          txn.execSync('COMMIT');
        } catch (error) {
          try { txn.execSync('ROLLBACK'); } catch { /* preserve the original error */ }
          throw error;
        } finally { txn.close(); }
        return;
      }
      let release!: () => void;
      const previous = exclusiveTestTransactionTail;
      exclusiveTestTransactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      database.exec('BEGIN');
      try {
        await task(transactionTarget);
        database.exec('COMMIT');
      } catch (error) {
        try { database.exec('ROLLBACK'); } catch { /* best effort */ }
        throw error;
      } finally {
        release();
      }
    },
    close() { database.close(); },
  };
  transactionTarget = api;
  return api;
}

export function createInitializedRealSqliteTestDb(path = ':memory:') {
  const db = createRealSqliteTestDb(path);
  // Lazy require avoids a storage -> test helper import cycle in production modules.
  const { ensureAppDatabase } = require('../storage/database') as typeof import('../storage/database');
  ensureAppDatabase(db as never);
  return db;
}
