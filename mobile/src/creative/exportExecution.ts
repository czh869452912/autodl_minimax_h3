import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import type { WorkflowOperation } from '../workflows/executor/types';

type Delivery = { id: string; version_id: string; status: string; publication_key: string; execution_epoch: string; blob_sha256: string; relative_path: string; mime: string; file_state: string };
type Deps = {
  now(): number;
  verify(path: string, sha256: string): Promise<boolean>;
  lookup(key: string, mime: string, sha256: string): Promise<string | null>;
  publish(path: string, key: string, mime: string, sha256: string): Promise<string>;
};

export async function executeCreativeExport(db: AppDatabase, operation: WorkflowOperation, owner: string, deps: Deps) {
  const deliveryId = operation.payload.deliveryId;
  if (operation.payload.kind !== 'creative_version' || typeof deliveryId !== 'string' || operation.jobId) throw new Error('INVALID_CREATIVE_EXPORT');
  const authorized = async (tx: AppDatabase) => Boolean(await tx.getFirstAsync(
    `SELECT 1 FROM workflow_operations o JOIN creative_deliveries d ON d.operation_id=o.id
     JOIN creative_execution_state e ON e.id=1 AND e.epoch=d.execution_epoch
     WHERE o.id=? AND d.id=? AND o.state='CLAIMED' AND o.lease_owner=? AND o.attempt=? AND o.lease_expires_at>?
       AND NOT EXISTS(SELECT 1 FROM creative_restore_quarantine q WHERE q.entity_kind='operation' AND q.entity_id=o.id)`,
    operation.id, deliveryId, owner, operation.attempt, deps.now()));
  const delivery = await db.getFirstAsync<Delivery>(`SELECT d.*,f.blob_sha256,f.state AS file_state,b.relative_path,b.mime FROM creative_deliveries d
    JOIN creative_version_files f ON f.version_id=d.version_id AND f.role=d.file_role
    JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE d.id=? AND d.operation_id=?`, deliveryId, operation.id);
  if (!delivery || !await authorized(db)) return;
  const finish = async (status: 'EXPORTED' | 'FAILED' | 'DELIVERY_UNKNOWN', uri: string | null, code: string | null) => withWriteTransaction(db, async tx => {
    if (!await authorized(tx)) throw new Error('EXPORT_LEASE_LOST');
    await tx.runAsync('UPDATE creative_deliveries SET status=?,destination_uri=?,error_code=?,updated_at=? WHERE id=?', status, uri, code, deps.now(), deliveryId);
    await tx.runAsync("UPDATE workflow_operations SET state=?,lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE id=?", status === 'EXPORTED' ? 'SUCCEEDED' : status === 'FAILED' ? 'FAILED' : 'BLOCKED', code ? JSON.stringify({ code, message: code }) : null, deps.now(), operation.id);
    await tx.runAsync("DELETE FROM artifact_blob_refs WHERE owner_type='creative_delivery' AND owner_id=?", deliveryId);
  });
  // A previous worker may already have crossed the external publication boundary.
  // Only verified native lookup can complete it; absence never authorizes a replay.
  if (delivery.status === 'PUBLISHING') {
    let uri: string | null = null;
    try { uri = await deps.lookup(delivery.publication_key, delivery.mime, delivery.blob_sha256); } catch { /* ambiguous */ }
    await finish(uri ? 'EXPORTED' : 'DELIVERY_UNKNOWN', uri, uri ? null : 'EXPORT_OUTCOME_UNKNOWN');
    return;
  }
  if (delivery.status !== 'QUEUED') { await finish('DELIVERY_UNKNOWN', null, 'EXPORT_STATE_CONFLICT'); return; }
  let valid = false;
  try { valid = delivery.file_state === 'AVAILABLE' && await deps.verify(delivery.relative_path, delivery.blob_sha256); } catch { /* unavailable */ }
  if (!valid) {
    await withWriteTransaction(db, async tx => {
      if (!await authorized(tx)) throw new Error('EXPORT_LEASE_LOST');
      await tx.runAsync("UPDATE creative_version_files SET state='MISSING' WHERE version_id=? AND role='original'", delivery.version_id);
    });
    await finish('FAILED', null, 'EXPORT_SOURCE_MISSING'); return;
  }
  await withWriteTransaction(db, async tx => {
    if (!await authorized(tx)) throw new Error('EXPORT_LEASE_LOST');
    const r = await tx.runAsync("UPDATE creative_deliveries SET status='PUBLISHING',updated_at=? WHERE id=? AND status='QUEUED'", deps.now(), deliveryId);
    if (Number(r.changes) !== 1) throw new Error('EXPORT_ALREADY_STARTED');
  });
  if (!await authorized(db)) return;
  let uri: string;
  try { uri = await deps.publish(delivery.relative_path, delivery.publication_key, delivery.mime, delivery.blob_sha256); }
  catch { await finish('DELIVERY_UNKNOWN', null, 'EXPORT_OUTCOME_UNKNOWN'); return; }
  // Let a failed local commit retain PUBLISHING so recovery performs lookup only.
  await finish('EXPORTED', uri, null);
}
