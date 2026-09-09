import type { SQLiteDatabase, SQLiteStatement } from 'expo-sqlite';

export type AppStatement = Pick<SQLiteStatement, 'executeSync' | 'executeAsync' | 'finalizeSync' | 'finalizeAsync'>;

// Application capability, not the full native Expo connection API.
export type AppDatabase = Pick<SQLiteDatabase,
  'runSync' | 'runAsync' | 'execSync' | 'execAsync' |
  'getFirstSync' | 'getFirstAsync' | 'getAllSync' | 'getAllAsync' |
  'withTransactionSync' | 'withTransactionAsync'
> & {
  prepareSync(sql: string): AppStatement;
  prepareAsync(sql: string): Promise<AppStatement>;
  withExclusiveTransactionAsync(work: (tx: AppDatabase) => Promise<void>): Promise<void>;
};
