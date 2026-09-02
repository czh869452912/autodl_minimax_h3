import { DatabaseSync } from 'node:sqlite';

export function createRealSqliteTestDb() {
  const database = new DatabaseSync(':memory:');
  const values = (params: unknown[]) => params as Parameters<ReturnType<DatabaseSync['prepare']>['run']>;
  return {
    execSync(source: string) { database.exec(source); },
    runSync(source: string, ...params: unknown[]) { return database.prepare(source).run(...values(params)); },
    async runAsync(source: string, ...params: unknown[]) { return database.prepare(source).run(...values(params)); },
    getFirstSync<T>(source: string, ...params: unknown[]) { return database.prepare(source).get(...values(params)) as T | undefined; },
    async getFirstAsync<T>(source: string, ...params: unknown[]) { return database.prepare(source).get(...values(params)) as T | undefined; },
    getAllSync<T>(source: string, ...params: unknown[]) { return database.prepare(source).all(...values(params)) as T[]; },
    async getAllAsync<T>(source: string, ...params: unknown[]) { return database.prepare(source).all(...values(params)) as T[]; },
    close() { database.close(); },
  };
}
