import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRealSqliteTestDb } from '../test/realSqlite';
import { ensureAppDatabase } from '../storage/database';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget, type ReserveInput } from './budget';
import { quarantineRestoredExecution } from '../storage/restoreIsolation';

async function fixture(options: { requestLimit?: number; amountLimit?: number | null; unknown?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'creative-budget-'));
  const db = createRealSqliteTestDb(join(directory, 'db.sqlite'), { independentTransactions: true });
  ensureAppDatabase(db as never);
  let now = 1000;
  const secrets = new Map<string, string>();
  const verify = jest.fn(async (_provider: string, token: string) => ({ namespace: 'novelai', principalId: token.slice(-1) }));
  const accounts = createCreativeAccounts(db as never, { now: () => now, verify, secrets: { get: async key => secrets.get(key) ?? null, set: async (key, secret) => { secrets.set(key, secret); }, remove: async key => { secrets.delete(key); } } });
  const account = await accounts.connect('novelai', 'token-secret-A');
  const budget = createCreativeBudget(db as never, () => now);
  const grantInput = { provider: 'novelai' as const, generationId: account.generationId, operations: ['image.generate'], requestLimit: options.requestLimit ?? 2, amountLimit: options.amountLimit === undefined ? 100 : options.amountLimit, allowUnknownCost: options.unknown ?? false, maxUnknownRequests: options.unknown ? 1 : 0, expiresAt: 10000 };
  const authorizationId = await budget.grant(grantInput);
  const requestHash = 'a'.repeat(64);
  const input: ReserveInput = { authorizationId, commandId: 'command-1', provider: 'novelai', requestHash, operation: 'image.generate', requestUnits: 1, estimate: { maximum: 50, unit: 'anlas', requestHash, validUntil: 5000 } };
  return { db, budget, account, accounts, secrets, verify, input, grantInput, identity: { ...account, requestHash }, age: () => { now = 6000; }, close: () => { db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('independent connections competing for the last request reserve exactly one', async () => {
  const f = await fixture({ requestLimit: 1 });
  try {
    const results = await Promise.allSettled([f.budget.reserve(f.input), f.budget.reserve({ ...f.input, commandId: 'command-2' })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_events')).toHaveLength(1);
  } finally { f.close(); }
});

test('idempotent reservation, zero-cost request counting and atomic event failure', async () => {
  const f = await fixture({ requestLimit: 1 });
  try {
    const input = { ...f.input, estimate: { ...f.input.estimate, maximum: 0 } };
    const first = await f.budget.reserve(input);
    expect((await f.budget.reserve(input)).id).toBe(first.id);
    await expect(f.budget.reserve({ ...input, commandId: 'other' })).rejects.toThrow('REQUEST_BUDGET_EXCEEDED');
    await expect(f.budget.reserve({ ...input, requestHash: 'b'.repeat(64) })).rejects.toThrow('RESERVATION_IDEMPOTENCY_CONFLICT');
    await f.budget.transition(first.id, { key: 'cancel', to: 'RELEASED' });
    f.db.execSync("CREATE TRIGGER fail_budget BEFORE INSERT ON creative_budget_events BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.budget.reserve({ ...input, commandId: 'other' })).rejects.toThrow('injected');
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
  } finally { f.close(); }
});

test('unknown results hold request and money; settlement is idempotent and overspend blocks new work', async () => {
  const f = await fixture();
  try {
    const first = await f.budget.reserve(f.input);
    await f.budget.dispatch(first.id, f.identity);
    await expect(f.budget.dispatch(first.id, f.identity)).rejects.toThrow('RESERVATION_NOT_DISPATCHABLE');
    await f.budget.transition(first.id, { key: 'timeout', to: 'UNKNOWN_HELD' });
    await expect(f.budget.transition(first.id, { key: 'release', to: 'RELEASED' })).rejects.toThrow('BUDGET_TRANSITION_INVALID');
    await expect(f.budget.reserve({ ...f.input, commandId: 'second', estimate: { ...f.input.estimate, maximum: 60 } })).rejects.toThrow('AMOUNT_BUDGET_EXCEEDED');
    const settlement = { key: 'settle', to: 'SETTLED' as const, actualAmount: 120, evidence: 'provider receipt charge' };
    await f.budget.transition(first.id, settlement); await f.budget.transition(first.id, settlement);
    await expect(f.budget.transition(first.id, { ...settlement, actualAmount: 0 })).rejects.toThrow('BUDGET_EVENT_CONFLICT');
    await expect(f.budget.reserve({ ...f.input, commandId: 'second' })).rejects.toThrow('AMOUNT_BUDGET_EXCEEDED');
    expect(() => f.db.runSync('DELETE FROM creative_budget_events')).toThrow('BUDGET_EVENTS_APPEND_ONLY');
  } finally { f.close(); }
});

test('unknown cost requires its own quota and cannot coexist with a hard amount cap', async () => {
  const f = await fixture({ amountLimit: null, unknown: true });
  try {
    await expect(f.budget.grant({ ...f.grantInput, amountLimit: 100 })).rejects.toThrow('UNKNOWN_COST_WITH_HARD_CAP');
    const input = { ...f.input, estimate: { ...f.input.estimate, maximum: null } };
    await f.budget.reserve(input);
    await expect(f.budget.reserve({ ...input, commandId: 'other' })).rejects.toThrow('UNKNOWN_COST_NOT_AUTHORIZED');
    await expect(f.budget.reserve({ ...f.input, commandId: 'wrong-unit', estimate: { ...f.input.estimate, unit: 'autodl_points' } })).rejects.toThrow('ESTIMATE_INVALID');
  } finally { f.close(); }
});

test('expired estimates, revoked authorizations and restored snapshots cannot dispatch', async () => {
  const f = await fixture();
  try {
    const r = await f.budget.reserve(f.input);
    f.age(); await expect(f.budget.dispatch(r.id, f.identity)).rejects.toThrow('ESTIMATE_INVALID');
    const other = await f.budget.reserve({ ...f.input, commandId: 'new', estimate: { ...f.input.estimate, validUntil: 10000 } });
    await f.budget.revoke(f.input.authorizationId);
    await expect(f.budget.dispatch(other.id, f.identity)).rejects.toThrow('AUTHORIZATION_INACTIVE');
    quarantineRestoredExecution(f.db as never, 'b'.repeat(32));
    await expect(f.budget.dispatch(other.id, f.identity)).rejects.toThrow('AUTHORIZATION_INACTIVE');
    await expect(f.budget.transition(other.id, { key: 'restore-release', to: 'RELEASED' })).rejects.toThrow('BUDGET_RESTORED_REQUIRES_RECONCILIATION');
    expect(await f.accounts.list()).toEqual([]);
    expect(f.db.getAllSync("SELECT * FROM creative_budget_reservations WHERE state='RESERVED'")).toHaveLength(2);
  } finally { f.close(); }
});

test('project grants cannot authorize a different project or an unscoped request', async () => {
  const f = await fixture();
  try {
    f.db.runSync("INSERT INTO creative_projects VALUES('project','title','brief',0,NULL,1,1)");
    const grant = await f.budget.grant({ ...f.grantInput, projectId: 'project' });
    await expect(f.budget.reserve({ ...f.input, authorizationId: grant })).rejects.toThrow('AUTHORIZATION_SCOPE_MISMATCH');
    const r = await f.budget.reserve({ ...f.input, authorizationId: grant, projectId: 'project' });
    await f.budget.dispatch(r.id, f.identity);
    await f.budget.revoke(grant);
    // Revocation after the dispatch point does not pretend to undo the request.
    await f.budget.transition(r.id, { key: 'finished', to: 'SETTLED', actualAmount: 40, evidence: 'provider charge receipt' });
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({ state: 'SETTLED' });
  } finally { f.close(); }
});

test('credential rotation after verification cannot spend under the old authorization', async () => {
  const f = await fixture();
  try {
    const r = await f.budget.reserve(f.input);
    const exact = await f.accounts.resolveExact(f.account.generationId);
    const newer = await f.accounts.connect('novelai', 'token-secret-B');
    expect(newer.generationId).not.toBe(f.account.generationId);
    await expect(f.budget.dispatch(r.id, { ...exact, requestHash: f.input.requestHash })).rejects.toThrow('AUTHORIZATION_INACTIVE');
    await expect(f.accounts.resolveExact(f.account.generationId)).rejects.toThrow('CREDENTIAL_GENERATION_INACTIVE');
    expect((await f.accounts.resolveExact(f.account.generationId, 'query')).token).toBe('token-secret-A');
    const key = f.db.getFirstSync<{ secure_store_key: string }>('SELECT secure_store_key FROM creative_credential_generations WHERE id=?', newer.generationId)!.secure_store_key;
    f.secrets.set(key, 'token-secret-C');
    await expect(f.accounts.resolveExact(newer.generationId)).rejects.toThrow('CREDENTIAL_GENERATION_MISMATCH');
    expect(JSON.stringify(f.db.getAllSync('SELECT * FROM creative_credential_generations'))).not.toContain('token-secret');
  } finally { f.close(); }
});

test('provider identity mismatch fails closed and rotation without stable ID binds a fresh generation', async () => {
  const f = await fixture();
  try {
    f.verify.mockResolvedValueOnce({ namespace: 'novelai', principalId: 'wrong' });
    await expect(f.accounts.resolveExact(f.account.generationId)).rejects.toThrow('ACCOUNT_IDENTITY_MISMATCH');
    f.verify.mockResolvedValueOnce({ namespace: 'novelai', principalId: undefined as never });
    const connected = await f.accounts.connect('novelai', 'token-without-principal');
    expect(connected.identityMode).toBe('credential_bound');
    await f.accounts.disconnect('novelai');
    expect(f.secrets.size).toBe(0);
    await expect(f.accounts.resolveExact(connected.generationId, 'query')).rejects.toThrow('CREDENTIAL_GENERATION_INACTIVE');
  } finally { f.close(); }
});

test('visible project allowance excludes held requests, revoked grants and stale account generations', async () => {
 const f = await fixture({unknown:true,amountLimit:null});
 try {
  f.db.runSync("INSERT INTO creative_projects VALUES('p','Project','',0,NULL,1,1)");
  const id = await f.budget.grant({...f.grantInput, projectId:'p'});
  expect(await f.budget.availableUnknownRequests('p','novelai')).toBe(1);
  await f.budget.reserve({...f.input, authorizationId:id, projectId:'p', estimate:{...f.input.estimate,maximum:null}});
  expect(await f.budget.availableUnknownRequests('p','novelai')).toBe(0);
  const next = await f.budget.grant({...f.grantInput,projectId:'p'});
  expect(await f.budget.availableUnknownRequests('p','novelai')).toBe(1);
  await f.budget.revoke(next);
  expect(await f.budget.availableUnknownRequests('p','novelai')).toBe(0);
  await f.budget.grant({...f.grantInput,projectId:'p'});
  await f.accounts.connect('novelai','token-new-B');
  expect(await f.budget.availableUnknownRequests('p','novelai')).toBe(0);
 } finally { f.close(); }
});
