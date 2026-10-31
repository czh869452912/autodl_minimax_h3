import type { AppDatabase } from './appDatabase';

/** Called on the offline, upgraded staging database before it replaces live data. */
export function quarantineRestoredExecution(db: AppDatabase, epoch: string): void {
  if (!/^[a-f0-9]{32}$/.test(epoch)) throw new Error('INVALID_RESTORE_EPOCH');
  db.execSync('BEGIN IMMEDIATE');
  try {
    db.runSync('UPDATE creative_execution_state SET epoch=? WHERE id=1', epoch);
    const reason = 'RESTORED_EXECUTION_REQUIRES_REVIEW';
    for (const [kind, table] of [['job', 'workflow_jobs'], ['operation', 'workflow_operations'], ['task', 'tasks']] as const) {
      db.runSync(`INSERT INTO creative_restore_quarantine(entity_kind,entity_id,restore_epoch,reason) SELECT ?,id,?,? FROM ${table} WHERE true ON CONFLICT(entity_kind,entity_id) DO UPDATE SET restore_epoch=excluded.restore_epoch,reason=excluded.reason`, kind, epoch, reason);
    }
    // Include every historical job, even READY_TO_SUBMIT and terminal snapshots.
    const error = JSON.stringify({ code: reason, message: '恢复的任务未自动执行；请核对结果，重新生成可能重复消费', retryable: false });
    db.runSync("UPDATE workflow_operations SET state='BLOCKED',lease_owner=NULL,lease_expires_at=NULL,last_error_json=? WHERE state IN ('PENDING','CLAIMED')", error);
    db.runSync("UPDATE workflow_jobs SET status='UNKNOWN',last_error_json=?,error_json=? WHERE status NOT IN ('SUCCEEDED','PARTIAL_SUCCEEDED','FAILED','CANCELLED')", error, error);
    db.runSync("UPDATE tasks SET status='UNKNOWN',sync_error=? WHERE status IN ('QUEUED','RUNNING','UNKNOWN')", reason);
    db.runSync("UPDATE tasks SET export_state='NOT_REQUESTED',download_error=? WHERE export_state IN ('QUEUED','EXPORTING') OR download_state='DOWNLOADING'", reason);
    db.runSync("UPDATE creative_deliveries SET status='QUARANTINED',error_code=? WHERE status IN ('QUEUED','PUBLISHING')", reason);
    db.runSync("UPDATE creative_timeline_renders SET state='QUARANTINED',error=? WHERE state IN ('QUEUED','RENDERING')",reason);
    db.runSync('UPDATE creative_authorizations SET revoked_at=COALESCE(revoked_at,?),revision=revision+1', Date.now());
    db.runSync("UPDATE creative_credential_generations SET status='retired' WHERE status='active'");
    db.runSync('DELETE FROM creative_default_accounts');
    db.runSync("INSERT INTO creative_restore_quarantine(entity_kind,entity_id,restore_epoch,reason) SELECT 'plan',id,?,? FROM creative_plans WHERE true ON CONFLICT(entity_kind,entity_id) DO UPDATE SET restore_epoch=excluded.restore_epoch,reason=excluded.reason",epoch,reason);
    db.runSync("UPDATE creative_plans SET state='QUARANTINED',revision=revision+1 WHERE state='ACTIVE'");
    db.runSync("UPDATE creative_plan_steps SET state='BLOCKED',revision=revision+1,error_json=? WHERE state IN ('PENDING','WAITING_DECISION','READY','DISPATCHED')",error);
    db.runSync("UPDATE creative_decision_requests SET state='STALE',revision=revision+1 WHERE state='WAITING'");
    db.execSync('COMMIT');
  } catch (error) { db.execSync('ROLLBACK'); throw error; }
}
