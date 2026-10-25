import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import {claimMaintenanceWindowAsync} from './syncPolicy';
test('claims a persisted five-minute maintenance window unless forced', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    expect(await claimMaintenanceWindowAsync(db as never, 1_000, false)).toBe(true);
    expect(await claimMaintenanceWindowAsync(db as never, 1_001, false)).toBe(false);
    expect(await claimMaintenanceWindowAsync(db as never, 1_002, true)).toBe(true);
    expect(await claimMaintenanceWindowAsync(db as never, 301_001, false)).toBe(false);
    expect(await claimMaintenanceWindowAsync(db as never, 301_003, false)).toBe(true);
  } finally { db.close(); }
});
