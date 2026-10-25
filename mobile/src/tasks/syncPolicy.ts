import type { AppDatabase } from '../storage/appDatabase';
import { assertAppDatabaseWritableAsync } from '../storage/database';

export type SyncRequest = {
  reason: 'foreground' | 'background' | 'service';
  mode: 'poll' | 'maintenance' | 'service' | 'command';
  taskIds?: string[];
  forceMaintenance?: boolean;
};

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

export async function claimMaintenanceWindowAsync(
  db: AppDatabase, now: number, force: boolean, intervalMs = 300_000,
): Promise<boolean> {
  await assertAppDatabaseWritableAsync(db);
  const result = await db.runAsync(
    `INSERT INTO app_scheduler_leases(lease_key,owner,expires_at)
    VALUES ('foreground-maintenance-next','cooldown',?)
    ON CONFLICT(lease_key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE ? OR app_scheduler_leases.expires_at <= ?`,
    now + Math.max(1, intervalMs), force ? 1 : 0, now,
  );
  return changes(result) === 1;
}
