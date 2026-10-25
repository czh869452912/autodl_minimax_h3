import type { AppDatabase } from '../storage/appDatabase';
import { readCreativeJobBinding, type CreativeJobBinding } from '../creative/boundExecution';
import type { CredentialReference, CredentialUse, ExactCredentialResolver } from '../providers/credentials';

export type JobExecutionBinding =
  | { kind: 'creative'; credential: CredentialReference; reservation: CreativeJobBinding }
  | { kind: 'pinned'; credential: CredentialReference }
  | { kind: 'legacy' };

export class JobBindingError extends Error {
  constructor(code: 'CREATIVE_ACCOUNT_BINDING_MISSING' | 'TASK_ACCOUNT_BINDING_INVALID') {
    super(code); this.name = 'JobBindingError';
  }
}

/** Older records without a binding retain their compatibility fallback. New intents pin an exact generation. */
export async function readJobExecutionBinding(db: AppDatabase, jobId: string): Promise<JobExecutionBinding> {
  const reservation = await readCreativeJobBinding(db, jobId);
  if (reservation) return { kind: 'creative', reservation, credential: { accountId: reservation.account_binding_id, generationId: reservation.credential_generation_id, provider: reservation.provider_id } };
  // A broken creative context is never an unbound historical job.
  if (await db.getFirstAsync('SELECT job_id FROM creative_job_contexts WHERE job_id=?', jobId)) throw new JobBindingError('CREATIVE_ACCOUNT_BINDING_MISSING');
  const row = await db.getFirstAsync<{ payload_json: string }>("SELECT payload_json FROM workflow_operations WHERE job_id=? AND kind='SUBMIT' ORDER BY created_at,id LIMIT 1", jobId);
  let payload: Record<string, unknown> = {};
  if (row) {
    try { payload = JSON.parse(row.payload_json); } catch { throw new JobBindingError('TASK_ACCOUNT_BINDING_INVALID'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new JobBindingError('TASK_ACCOUNT_BINDING_INVALID');
  }
  const binding = payload.credentialBinding as CredentialReference | undefined;
  if (binding === undefined) return { kind: 'legacy' };
  if (!binding || !['accountId', 'generationId', 'provider'].every(key => typeof binding[key as keyof CredentialReference] === 'string' && binding[key as keyof CredentialReference].length > 0)) throw new JobBindingError('TASK_ACCOUNT_BINDING_INVALID');
  return { kind: 'pinned', credential: { accountId: binding.accountId, generationId: binding.generationId, provider: binding.provider } };
}

export async function resolveBoundJobCredential(binding: JobExecutionBinding, use: CredentialUse, resolve: ExactCredentialResolver) {
  if (binding.kind === 'legacy') return null;
  const expected = binding.credential, identity = await resolve(expected.generationId, use);
  if (identity.accountId !== expected.accountId || identity.generationId !== expected.generationId || identity.provider !== expected.provider) throw new Error('ACCOUNT_IDENTITY_MISMATCH');
  return identity;
}

/** Dispatch, polling and refreshed artifact URLs share the same binding rules. */
export async function resolveJobCredential(db: AppDatabase, jobId: string, use: CredentialUse, resolve: ExactCredentialResolver) {
  return resolveBoundJobCredential(await readJobExecutionBinding(db, jobId), use, resolve);
}
