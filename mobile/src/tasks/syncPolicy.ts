import type { SQLiteDatabase } from 'expo-sqlite';
import type { AppSettings } from '../settings/storage';
import { assertAppDatabaseWritable, assertAppDatabaseWritableAsync } from '../storage/database';

export type SyncRequest = {
  reason: 'foreground' | 'background' | 'service';
  mode: 'poll' | 'maintenance' | 'service' | 'command';
  taskIds?: string[];
  forceMaintenance?: boolean;
};

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

export function claimMaintenanceWindow(
  db: SQLiteDatabase,
  now: number,
  force: boolean,
  intervalMs = 300_000,
): boolean {
  assertAppDatabaseWritable(db);
  const result = db.runSync(
    `INSERT INTO app_scheduler_leases(lease_key,owner,expires_at)
    VALUES ('foreground-maintenance-next','cooldown',?)
    ON CONFLICT(lease_key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE ? OR app_scheduler_leases.expires_at <= ?`,
    now + Math.max(1, intervalMs), force ? 1 : 0, now,
  );
  return changes(result) === 1;
}

export async function claimMaintenanceWindowAsync(
  db: SQLiteDatabase, now: number, force: boolean, intervalMs = 300_000,
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

export function executorSettingsFingerprint(settings: AppSettings): string {
  return JSON.stringify({
    token: settings.token,
    autoExportToGallery: settings.autoExportToGallery,
    keepPrivateCopy: settings.keepPrivateCopy,
  });
}

export function createExecutorSettingsCache<T>(factory: (settings: AppSettings) => T) {
  let fingerprint: string | undefined;
  let value: T | undefined;
  return {
    getOrCreate(settings: AppSettings): T {
      const next = executorSettingsFingerprint(settings);
      if (value === undefined || next !== fingerprint) {
        value = factory(settings);
        fingerprint = next;
      }
      return value;
    },
  };
}
