import type { AppDatabase } from '../storage/appDatabase';
import type { ProviderAdapter } from '../workflows/providers/registry';
import type { WorkflowOperation } from '../workflows/executor/types';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { dispatchCreativeBudget, type Reservation } from './budget';
import { creativeRequestHash } from './videoSubmission';
import type { PreparedWorkflowSubmission } from '../workflows/runtime/runtime';

export async function readCreativeJobBinding(db: AppDatabase, jobId: string) {
  return db.getFirstAsync<Reservation & { context_hash: string }>('SELECT r.*,c.request_hash AS context_hash FROM creative_job_contexts c JOIN creative_budget_reservations r ON r.id=c.reservation_id WHERE c.job_id=?', jobId);
}

/** All calls retain the resolved exact secret; account switching cannot redirect them. */
export function bindCreativeAdapter(db: AppDatabase, adapter: ProviderAdapter, binding: Reservation & { context_hash: string },
  identity: { accountId: string; generationId: string }, operation: WorkflowOperation, owner: string, now = Date.now): ProviderAdapter {
  return { ...adapter, async submit(input, target) {
    const prepared = operation.payload.prepared as PreparedWorkflowSubmission;
    if (!prepared || creativeRequestHash(prepared) !== binding.context_hash || JSON.stringify(prepared.requestInput) !== JSON.stringify(input) || JSON.stringify(prepared.target) !== JSON.stringify(target)) throw new Error('CREATIVE_REQUEST_MISMATCH');
    await withWriteTransaction(db, async tx => {
      const current = await tx.getFirstAsync('SELECT id FROM workflow_operations WHERE id=? AND job_id=? AND state=\'CLAIMED\' AND lease_owner=? AND attempt=? AND lease_expires_at>?', operation.id, binding.job_id, owner, operation.attempt, now());
      if (!current) throw new Error('CREATIVE_DISPATCH_LEASE_LOST');
      if (await tx.getFirstAsync('SELECT entity_id FROM creative_restore_quarantine WHERE entity_id=?', binding.job_id)) throw new Error('CREATIVE_RESTORE_QUARANTINED');
      await dispatchCreativeBudget(tx, binding.id, { ...identity, requestHash: binding.context_hash }, now());
    });
    return adapter.submit(input, target);
  } };
}
