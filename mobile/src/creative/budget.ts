import { z } from 'zod';
import { createId } from '../ids';
import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import type { CreativeProvider } from './accounts';

const count = z.number().int().min(1).max(1000000000);
const money = z.number().int().min(0).max(1000000000);
const units = { novelai: 'anlas', autodl: 'autodl_points' } as const;
type Authorization = { id: string; revision: number; project_id: string | null; provider_id: CreativeProvider; account_binding_id: string; credential_generation_id: string; execution_epoch: string; allowed_operations_json: string; request_limit: number; amount_limit: number | null; unit: string; allow_unknown_cost: number; max_unknown_requests: number; expires_at: number; revoked_at: number | null };
export type Reservation = { id: string; authorization_id: string; authorization_revision: number; account_binding_id: string; credential_generation_id: string; execution_epoch: string; command_id: string; job_id: string | null; request_hash: string; operation: string; project_id: string | null; request_units: number; estimate_valid_until: number; reserved_amount: number | null; unit: string; state: string; actual_amount: number | null };
export type ReserveInput = { authorizationId: string; commandId: string; jobId?: string; requestHash: string; projectId?: string; provider: CreativeProvider; operation: string; requestUnits: number; estimate: { maximum: number | null; unit: string; requestHash: string; validUntil: number } };
async function authorization(tx: AppDatabase, id: string, now: number): Promise<Authorization> {
  const row = await tx.getFirstAsync<Authorization>(`SELECT a.* FROM creative_authorizations a JOIN creative_execution_state e ON e.id=1 AND e.epoch=a.execution_epoch
    JOIN creative_credential_generations g ON g.id=a.credential_generation_id AND g.account_binding_id=a.account_binding_id AND g.status='active'
    JOIN creative_default_accounts d ON d.provider_id=a.provider_id AND d.credential_generation_id=g.id WHERE a.id=?`, id);
  if (!row || row.revoked_at != null || row.expires_at <= now) throw new Error('AUTHORIZATION_INACTIVE');
  if (row.project_id && !await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', row.project_id)) throw new Error('PROJECT_NOT_AVAILABLE');
  return row;
}

/** Caller inserts its job, operation and receipt in this same transaction. */
export async function reserveCreativeBudget(tx: AppDatabase, input: ReserveInput, now: number): Promise<Reservation> {
  count.parse(input.requestUnits); z.string().min(1).max(200).parse(input.commandId);
  z.string().regex(/^[a-f0-9]{64}$/).parse(input.requestHash);
  const existing = await tx.getFirstAsync<Reservation>('SELECT * FROM creative_budget_reservations WHERE command_id=?', input.commandId);
  if (existing) {
    const storedAuth = await tx.getFirstAsync<{ provider_id: string }>('SELECT provider_id FROM creative_authorizations WHERE id=?', existing.authorization_id);
    if (storedAuth?.provider_id !== input.provider) throw new Error('RESERVATION_IDEMPOTENCY_CONFLICT');
    if (existing.request_hash !== input.requestHash || existing.authorization_id !== input.authorizationId || existing.project_id !== (input.projectId ?? null) || existing.operation !== input.operation || existing.request_units !== input.requestUnits || existing.unit !== input.estimate.unit || existing.job_id !== (input.jobId ?? null)) throw new Error('RESERVATION_IDEMPOTENCY_CONFLICT');
    return existing;
  }
  const auth = await authorization(tx, input.authorizationId, now);
  if (auth.provider_id !== input.provider || auth.project_id !== (input.projectId ?? null) || !JSON.parse(auth.allowed_operations_json).includes(input.operation)) throw new Error('AUTHORIZATION_SCOPE_MISMATCH');
  if (input.estimate.unit !== auth.unit || input.estimate.requestHash !== input.requestHash || input.estimate.validUntil <= now || !Number.isSafeInteger(input.estimate.validUntil)) throw new Error('ESTIMATE_INVALID');
  if (input.estimate.maximum != null) money.parse(input.estimate.maximum);
  const usage = await tx.getFirstAsync<{ requests: number; unknown_requests: number; amount: number }>(`SELECT COALESCE(SUM(request_units),0) AS requests,
    COALESCE(SUM(CASE WHEN reserved_amount IS NULL THEN request_units ELSE 0 END),0) AS unknown_requests,
    COALESCE(SUM(CASE WHEN state='SETTLED' THEN actual_amount ELSE reserved_amount END),0) AS amount
    FROM creative_budget_reservations WHERE authorization_id=? AND state!='RELEASED'`, auth.id);
  if ((usage?.requests ?? 0) + input.requestUnits > auth.request_limit) throw new Error('REQUEST_BUDGET_EXCEEDED');
  if (input.estimate.maximum === null) {
    if (!auth.allow_unknown_cost || auth.amount_limit !== null || (usage?.unknown_requests ?? 0) + input.requestUnits > auth.max_unknown_requests) throw new Error('UNKNOWN_COST_NOT_AUTHORIZED');
  } else if (auth.amount_limit !== null && (usage?.amount ?? 0) + input.estimate.maximum > auth.amount_limit) throw new Error('AMOUNT_BUDGET_EXCEEDED');
  const id = createId();
  await tx.runAsync("INSERT INTO creative_budget_reservations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'RESERVED',NULL,NULL,?,?)", id, auth.id, auth.revision, auth.account_binding_id, auth.credential_generation_id, auth.execution_epoch, input.commandId, input.jobId ?? null, input.requestHash, input.operation, input.projectId ?? null, input.requestUnits, input.estimate.validUntil, input.estimate.maximum, auth.unit, now, now);
  await tx.runAsync("INSERT INTO creative_budget_events VALUES(?,?,?,NULL,'RESERVED','reserve',?)", createId(), id, `reserve:${id}`, now);
  return (await tx.getFirstAsync<Reservation>('SELECT * FROM creative_budget_reservations WHERE id=?', id))!;
}

/** Linearization point: the caller may send only after this transaction commits. */
export async function dispatchCreativeBudget(tx: AppDatabase, id: string, exactIdentity: { accountId: string; generationId: string; requestHash: string }, now: number) {
  const r = await tx.getFirstAsync<Reservation>('SELECT * FROM creative_budget_reservations WHERE id=?', id);
  if (!r || r.state !== 'RESERVED') throw new Error('RESERVATION_NOT_DISPATCHABLE');
  if (r.request_hash !== exactIdentity.requestHash || r.estimate_valid_until <= now) throw new Error('ESTIMATE_INVALID');
  const auth = await authorization(tx, r.authorization_id, now);
  if (auth.revision !== r.authorization_revision || exactIdentity.accountId !== r.account_binding_id || exactIdentity.generationId !== r.credential_generation_id || auth.execution_epoch !== r.execution_epoch) throw new Error('RESERVATION_BINDING_MISMATCH');
  await tx.runAsync("UPDATE creative_budget_reservations SET state='DISPATCHED',updated_at=? WHERE id=?", now, id);
  await tx.runAsync("INSERT INTO creative_budget_events VALUES(?,?,?,'RESERVED','DISPATCHED','dispatch',?)", createId(), id, `dispatch:${id}`, now);
  return r;
}

export function createCreativeBudget(db: AppDatabase, now = Date.now) {
  return {
    async availableUnknownRequests(projectId: string, provider: CreativeProvider) {
      const rows = await db.getAllAsync<Authorization & { used: number; unknown_used: number }>(
        `SELECT a.*, COALESCE((SELECT SUM(r.request_units) FROM creative_budget_reservations r WHERE r.authorization_id=a.id AND r.state!='RELEASED'),0) AS used,
        COALESCE((SELECT SUM(r.request_units) FROM creative_budget_reservations r WHERE r.authorization_id=a.id AND r.state!='RELEASED' AND r.reserved_amount IS NULL),0) AS unknown_used
        FROM creative_authorizations a JOIN creative_execution_state e ON e.id=1 AND e.epoch=a.execution_epoch
        JOIN creative_default_accounts d ON d.provider_id=a.provider_id AND d.credential_generation_id=a.credential_generation_id
        JOIN creative_credential_generations g ON g.id=d.credential_generation_id AND g.status='active'
        JOIN creative_projects p ON p.id=a.project_id AND p.archived_at IS NULL
        WHERE a.project_id=? AND a.provider_id=? AND a.revoked_at IS NULL AND a.expires_at>? AND a.allow_unknown_cost=1 AND a.amount_limit IS NULL`, projectId, provider, now());
      return rows.filter(r => JSON.parse(r.allowed_operations_json).includes(provider === 'novelai' ? 'image.generate' : 'video.generate'))
        .reduce((sum, r) => sum + Math.max(0, Math.min(r.request_limit-r.used, r.max_unknown_requests-r.unknown_used)), 0);
    },
    async list() { return db.getAllAsync<Authorization>('SELECT * FROM creative_authorizations ORDER BY created_at DESC'); },
    async grant(input: { provider: CreativeProvider; generationId: string; projectId?: string; operations: string[]; requestLimit: number; amountLimit: number | null; allowUnknownCost: boolean; maxUnknownRequests: number; expiresAt: number }) {
      count.parse(input.requestLimit); money.nullable().parse(input.amountLimit); z.number().int().min(0).max(input.requestLimit).parse(input.maxUnknownRequests);
      z.array(z.enum(['image.generate','video.generate','image.encodeReference'])).min(1).parse(input.operations);
      if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now()) throw new Error('AUTHORIZATION_EXPIRY_INVALID');
      if (input.allowUnknownCost && input.amountLimit !== null) throw new Error('UNKNOWN_COST_WITH_HARD_CAP');
      return withWriteTransaction(db, async tx => {
        const current = await tx.getFirstAsync<{ account_binding_id: string; credential_generation_id: string }>("SELECT d.* FROM creative_default_accounts d JOIN creative_credential_generations g ON g.id=d.credential_generation_id AND g.status='active' WHERE d.provider_id=? AND g.id=?", input.provider, input.generationId);
        if (!current) throw new Error('CREDENTIAL_GENERATION_INACTIVE');
        if (input.projectId && !await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', input.projectId)) throw new Error('PROJECT_NOT_AVAILABLE');
        const epoch = await tx.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1');
        if (!epoch) throw new Error('EXECUTION_EPOCH_MISSING');
        const id = createId();
        await tx.runAsync('INSERT INTO creative_authorizations VALUES(?,0,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)', id, input.projectId ?? null, input.provider, current.account_binding_id, current.credential_generation_id, epoch.epoch, JSON.stringify([...new Set(input.operations)]), input.requestLimit, input.amountLimit, units[input.provider], input.allowUnknownCost ? 1 : 0, input.maxUnknownRequests, input.expiresAt, now());
        return id;
      });
    },
    async revoke(id: string) { await withWriteTransaction(db, async tx => { await tx.runAsync('UPDATE creative_authorizations SET revoked_at=COALESCE(revoked_at,?),revision=revision+1 WHERE id=? AND revoked_at IS NULL', now(), id); }); },
    reserve: (input: ReserveInput) => withWriteTransaction(db, tx => reserveCreativeBudget(tx, input, now())),
    dispatch: (id: string, identity: { accountId: string; generationId: string; requestHash: string }) => withWriteTransaction(db, tx => dispatchCreativeBudget(tx, id, identity, now())),
    async transition(id: string, input: { key: string; to: 'SETTLED' | 'UNKNOWN_HELD' | 'RELEASED'; actualAmount?: number; evidence?: string }) {
      z.string().min(1).max(200).parse(input.key);
      if (input.to === 'SETTLED') { money.parse(input.actualAmount); z.string().min(1).max(2000).parse(input.evidence); }
      const detail = JSON.stringify({ actualAmount: input.actualAmount ?? null, evidence: input.evidence ?? null });
      await withWriteTransaction(db, async tx => {
        const old = await tx.getFirstAsync<{ reservation_id: string; to_state: string; reason: string }>('SELECT * FROM creative_budget_events WHERE transition_key=?', input.key);
        if (old) { if (old.reservation_id !== id || old.to_state !== input.to || old.reason !== detail) throw new Error('BUDGET_EVENT_CONFLICT'); return; }
        const r = await tx.getFirstAsync<Reservation>('SELECT * FROM creative_budget_reservations WHERE id=?', id);
        const epoch = await tx.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1');
        if (r && epoch?.epoch !== r.execution_epoch) throw new Error('BUDGET_RESTORED_REQUIRES_RECONCILIATION');
        if (!r || (input.to === 'RELEASED' ? r.state !== 'RESERVED' : !['DISPATCHED','UNKNOWN_HELD'].includes(r.state))) throw new Error('BUDGET_TRANSITION_INVALID');
        await tx.runAsync('UPDATE creative_budget_reservations SET state=?,actual_amount=?,evidence_json=?,updated_at=? WHERE id=?', input.to, input.to === 'SETTLED' ? input.actualAmount! : null, detail, now(), id);
        await tx.runAsync('INSERT INTO creative_budget_events VALUES(?,?,?,?,?,?,?)', createId(), id, input.key, r.state, input.to, detail, now());
      });
    },
  };
}
