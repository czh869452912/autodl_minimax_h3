import type { SQLiteDatabase } from 'expo-sqlite';

// Expo's exclusive transaction helper opens a fresh connection without inheriting
// PRAGMAs. Configure that connection before BEGIN (inside BEGIN is too late).
export function withForeignKeyConnections(db: SQLiteDatabase, open: () => Promise<SQLiteDatabase>): SQLiteDatabase {
  db.execSync('PRAGMA foreign_keys=ON');
  return new Proxy(db, {
    get(target, key) {
      if (key === 'withExclusiveTransactionAsync') return async (work: (tx: SQLiteDatabase) => Promise<void>) => {
        const tx = await open();
        let begun = false;
        try {
          await tx.execAsync('PRAGMA foreign_keys=ON');
          if ((await tx.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys !== 1) throw new Error('FOREIGN_KEYS_UNAVAILABLE');
          await tx.execAsync('BEGIN'); begun = true;
          await work(tx);
          await tx.execAsync('COMMIT'); begun = false;
        } catch (error) {
          if (begun) { try { await tx.execAsync('ROLLBACK'); } catch { /* preserve cause */ } }
          throw error;
        } finally { await tx.closeAsync(); }
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
