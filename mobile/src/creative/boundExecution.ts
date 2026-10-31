import {ProviderPreflightError} from '../workflows/providers/errors';
import type { AppDatabase } from '../storage/appDatabase';
import type { ProviderAdapter } from '../workflows/providers/registry';
import type { WorkflowOperation } from '../workflows/executor/types';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { dispatchCreativeBudget, type Reservation } from './budget';
import { creativeRequestHash } from './videoSubmission';
import type { PreparedWorkflowSubmission } from '../workflows/runtime/runtime';

export type CreativeJobBinding = Reservation & { context_hash: string; provider_id: string };
export async function readCreativeJobBinding(db: AppDatabase, jobId: string) {
  return db.getFirstAsync<CreativeJobBinding>(`SELECT r.*,c.request_hash AS context_hash,a.provider_id
    FROM creative_job_contexts c JOIN creative_budget_reservations r ON r.id=c.reservation_id
    JOIN creative_authorizations a ON a.id=r.authorization_id WHERE c.job_id=?`, jobId);
}

/** All calls retain the resolved exact secret; account switching cannot redirect them. */
export function bindCreativeAdapter(db: AppDatabase, adapter: ProviderAdapter, binding: Reservation & { context_hash: string },
  identity: { accountId: string; generationId: string }, operation: WorkflowOperation, owner: string, now = Date.now): ProviderAdapter {
  return { ...adapter, async submit(input, target) {
    const prepared = operation.payload.prepared as PreparedWorkflowSubmission;
    if (!prepared || creativeRequestHash(prepared) !== binding.context_hash || JSON.stringify(prepared.requestInput) !== JSON.stringify(input) || JSON.stringify(prepared.target) !== JSON.stringify(target)) throw new ProviderPreflightError('CREATIVE_REQUEST_MISMATCH','CREATIVE_REQUEST_MISMATCH');
    let outgoing:Record<string,unknown>;
    try{
    outgoing=adapter.prepareInput?await adapter.prepareInput(input,target):input;
    await withWriteTransaction(db, async tx => {
      const current = await tx.getFirstAsync('SELECT id FROM workflow_operations WHERE id=? AND job_id=? AND state=\'CLAIMED\' AND lease_owner=? AND attempt=? AND lease_expires_at>?', operation.id, binding.job_id, owner, operation.attempt, now());
      if (!current) throw new Error('CREATIVE_DISPATCH_LEASE_LOST');
      if (await tx.getFirstAsync('SELECT entity_id FROM creative_restore_quarantine WHERE entity_id=?', binding.job_id)) throw new Error('CREATIVE_RESTORE_QUARANTINED');
      await dispatchCreativeBudget(tx, binding.id, { ...identity, requestHash: binding.context_hash }, now());
    });
    }catch(error){if(error instanceof Error&&error.message.startsWith('OUTBOUND_'))throw new ProviderPreflightError(error.message,'素材外发许可缺失、变化或已撤销，本次未发送。请从原输入重新准备并确认外发许可。');if(error instanceof ProviderPreflightError)throw error;throw new ProviderPreflightError('CREATIVE_DISPATCH_NOT_SENT',error instanceof Error?error.message:'本地准备未完成，请检查账号、素材和授权后重新生成。');}
    return adapter.submit(outgoing, target);
  } };
}
