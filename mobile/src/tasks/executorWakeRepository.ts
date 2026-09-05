import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritableAsync } from '../storage/database';

export type WakeState = Readonly<{ generation: number; handledGeneration: number; maintenanceGeneration: number; requestedAt: number }>;

export function createExecutorWakeRepository(db: SQLiteDatabase) {
  const read = async (): Promise<WakeState> => {
    const row = await db.getFirstAsync<WakeState>(`SELECT generation, handled_generation AS handledGeneration,
      maintenance_generation AS maintenanceGeneration, requested_at AS requestedAt FROM executor_wake_state WHERE singleton=1`);
    if (!row) throw new Error('EXECUTOR_WAKE_STATE_MISSING');
    return row;
  };
  return {
    read,
    async requestWake(now: number, maintenance?: 'force-next-slice'): Promise<WakeState> {
      await assertAppDatabaseWritableAsync(db);
      const row = await db.getFirstAsync<WakeState>(`UPDATE executor_wake_state SET
        maintenance_generation=CASE WHEN ? AND maintenance_generation<=handled_generation THEN generation+1 ELSE maintenance_generation END,
        generation=generation+1, requested_at=? WHERE singleton=1
        RETURNING generation, handled_generation AS handledGeneration, maintenance_generation AS maintenanceGeneration, requested_at AS requestedAt`,
      maintenance ? 1 : 0, now);
      if (!row) throw new Error('EXECUTOR_WAKE_STATE_MISSING');
      return row;
    },
    async acknowledge(generation: number): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await db.runAsync('UPDATE executor_wake_state SET handled_generation=MAX(handled_generation,MIN(generation,?)) WHERE singleton=1', generation);
    },
  };
}
export type ExecutorWakeRepository = ReturnType<typeof createExecutorWakeRepository>;
