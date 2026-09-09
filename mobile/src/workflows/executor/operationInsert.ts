import type { AppDatabase } from '../../storage/appDatabase';
import type { EnqueueOperation } from './types';

type ConflictPolicy = 'ignore' | 'error';
function statement(policy: ConflictPolicy) {
  return `INSERT ${policy === 'ignore' ? 'OR IGNORE ' : ''}INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,'PENDING',0,?,?,?)`;
}
function parameters(input: EnqueueOperation) {
  return [input.id, input.kind, input.jobId ?? null, input.idempotencyKey, JSON.stringify(input.payload), input.nextRetryAt ?? input.now, input.now, input.now];
}
// The caller owns the transaction. No nested transaction or post-commit effect.
export function insertWorkflowOperation(tx: AppDatabase, input: EnqueueOperation, policy: ConflictPolicy) {
  return tx.runAsync(statement(policy), ...parameters(input));
}
export function insertWorkflowOperationSync(tx: AppDatabase, input: EnqueueOperation, policy: ConflictPolicy) {
  return tx.runSync(statement(policy), ...parameters(input));
}
