import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { repairStaleTaskStatuses } from './taskProjectionRepair';

test('repairs old completed jobs even when media timestamps are newer and maintenance is in cooldown', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    for (let n = 0; n < 40; n++) {
      db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES (?,'w','1','h','a','1','{}','SUCCEEDED',?,?)", `j${n}`, n, n);
      db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,local_uri,download_state,export_state,created_at,updated_at) VALUES (?,'p','RUNNING','480p',1,'file:///saved','DOWNLOADED','EXPORTED',?,9999)", `j${n}`, n);
    }
    db.runSync("INSERT INTO app_scheduler_leases VALUES ('foreground-maintenance-next','cooldown',9999999999999)");
    expect(await repairStaleTaskStatuses(db as never)).toEqual({ repaired: 32, hasMore: true });
    expect(await repairStaleTaskStatuses(db as never)).toEqual({ repaired: 8, hasMore: false });
    expect(db.getFirstSync("SELECT COUNT(*) AS count FROM tasks WHERE status='SUCCESS' AND download_state='DOWNLOADED' AND export_state='EXPORTED' AND local_uri='file:///saved'")).toEqual({ count: 40 });
    expect(await repairStaleTaskStatuses(db as never)).toEqual({ repaired: 0, hasMore: false });
  } finally { db.close(); }
});
