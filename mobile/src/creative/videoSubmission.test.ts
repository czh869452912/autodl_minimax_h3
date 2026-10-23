import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget } from './budget';
import { submitCreativeVideo } from './videoSubmission';
import { bindCreativeAdapter, readCreativeJobBinding } from './boundExecution';
import { archiveCreativeOutput } from './archiveOutput';
import { H3_WORKFLOW_ID } from '../workflows/providers/autodl/metadata';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createTaskRepository } from '../tasks/repository';
import { quarantineRestoredExecution } from '../storage/restoreIsolation';
import type { WorkflowOperation } from '../workflows/executor/types';
import type { ProviderAdapter } from '../workflows/providers/registry';

async function fixture() {
  const db = createInitializedRealSqliteTestDb(), service = createCreativeService(db as never);
  const result = await service.execute({ name: 'draft.createVideo', payload: { prompt: 'A cinematic scene' } }, 'draft');
  if (result.status !== 'completed') throw new Error('Expected completed');
  const draft = (await service.draft(result.value.draftId))!;
  const secrets = new Map<string,string>();
  const accounts = createCreativeAccounts(db as never, { now: () => 100, verify: async () => ({ namespace: 'autodl', authenticated: false }), secrets: { get: async k => secrets.get(k) ?? null, set: async (k,v) => { secrets.set(k,v); }, remove: async k => { secrets.delete(k); } } });
  const identity = await accounts.connect('autodl', 'original-secret');
  const budget = createCreativeBudget(db as never, () => 100);
  const authorizationId = await budget.grant({ provider: 'autodl', generationId: identity.generationId, operations: ['video.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: 10000 });
  const prepared = { workflowId: H3_WORKFLOW_ID, workflowVersion: '1', workflowContentHash: 'hash', adapterId: 'a', adapterVersion: '1', inputSnapshot: { prompt: 'A cinematic scene', seed: 1 }, requestInput: { prompt: 'A cinematic scene', seed: 1 }, target: { operation: 'generate' } };
  const input = { draftId: draft.id, expectedRevision: 0, draftInputJson: draft.input_json, authorizationId, prepared, images: [], versionIds: [] };
  const submit = () => submitCreativeVideo(db as never, input, 100);
  const claim = async () => {
    const task = await submit();
    db.runSync("UPDATE workflow_operations SET state='CLAIMED',lease_owner='worker',lease_expires_at=10000,attempt=1 WHERE job_id=?", task.id);
    const binding = (await readCreativeJobBinding(db as never, task.id))!;
    const operation: WorkflowOperation = { id: `${task.id}:submit`, jobId: task.id, kind: 'SUBMIT', attempt: 1, payload: { prepared }, idempotencyKey: 'submit', state: 'CLAIMED', nextRetryAt: 0, createdAt: 100, updatedAt: 100 };
    const remote = jest.fn(async () => ({ id: 'remote' }));
    const adapter = bindCreativeAdapter(db as never, { submit: remote } as unknown as ProviderAdapter, binding, identity, operation, 'worker', () => 200);
    return { task, binding, operation, remote, adapter };
  };
  return { db, service, draft, accounts, identity, input, submit, claim };
}

test('draft submission commits receipt, job, frozen inputs and budget atomically; duplicate never queues twice', async () => {
  const f = await fixture();
  try {
    f.db.execSync("CREATE TRIGGER reject_creative_receipt BEFORE INSERT ON creative_command_receipts WHEN NEW.command_name='draft.submitVideo' BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.submit()).rejects.toThrow('injected');
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(0);
    expect((await f.service.draft(f.draft.id))?.state).toBe('EDITING');
    f.db.execSync('DROP TRIGGER reject_creative_receipt');
    const task = await f.submit();
    expect(f.db.getFirstSync('SELECT verified_at,created_at FROM creative_account_bindings')).toEqual({ verified_at: 0, created_at: 100 });
    expect(f.db.getFirstSync('SELECT verified_at FROM creative_credential_generations')).toEqual({ verified_at: 0 });
    expect((await f.submit()).id).toBe(task.id);
    expect(f.db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
    await expect(createTaskRepository(f.db as never).remove(task.id)).rejects.toThrow('归档');
    await expect(submitCreativeVideo(f.db as never, { ...f.input, prepared: { ...f.input.prepared, requestInput: { altered: true } } }, 101)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { f.db.close(); }
});

test('dispatch binds exact request and credential generation; a switched account sends nothing', async () => {
  const f = await fixture();
  try {
    const c = await f.claim();
    await expect(c.adapter.submit({ changed: true }, f.input.prepared.target)).rejects.toThrow('REQUEST_MISMATCH');
    await f.accounts.connect('autodl', 'replacement-secret');
    await expect(c.adapter.submit(f.input.prepared.requestInput, f.input.prepared.target)).rejects.toThrow('AUTHORIZATION_INACTIVE');
    expect(c.remote).not.toHaveBeenCalled();
    expect((await f.accounts.resolveExact(f.identity.generationId, 'query')).token).toBe('original-secret');
  } finally { f.db.close(); }
});

test('dispatch marker survives unknown response and forbids another external request', async () => {
  const f = await fixture();
  try {
    const c = await f.claim(); c.remote.mockRejectedValueOnce(new Error('network lost'));
    await expect(c.adapter.submit(f.input.prepared.requestInput, f.input.prepared.target)).rejects.toThrow('network lost');
    await expect(c.adapter.submit(f.input.prepared.requestInput, f.input.prepared.target)).rejects.toThrow('NOT_DISPATCHABLE');
    expect(c.remote).toHaveBeenCalledTimes(1);
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({ state: 'DISPATCHED' });
  } finally { f.db.close(); }
});

test('restored pending jobs and stale leases never reach the provider', async () => {
  const f = await fixture();
  try {
    const c = await f.claim();
    f.db.runSync('UPDATE workflow_operations SET lease_expires_at=100');
    await expect(c.adapter.submit(f.input.prepared.requestInput, f.input.prepared.target)).rejects.toThrow('LEASE_LOST');
    quarantineRestoredExecution(f.db as never, 'b'.repeat(32));
    await expect(c.adapter.submit(f.input.prepared.requestInput, f.input.prepared.target)).rejects.toThrow();
    expect(c.remote).not.toHaveBeenCalled();
  } finally { f.db.close(); }
});

test('output candidates are pinned atomically and never overwrite selected/default versions', async () => {
  const f = await fixture();
  try {
    const task = await f.submit(), hash = 'b'.repeat(64);
    f.db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'video/mp4', `cas/${hash}`);
    const artifact = { jobId: task.id, artifact: { id: 'clip', kind: 'video' }, blob: { sha256: hash }, now: 200 } as Parameters<typeof archiveCreativeOutput>[1];
    f.db.execSync("CREATE TRIGGER reject_output_link BEFORE INSERT ON creative_output_links BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, artifact))).rejects.toThrow('injected');
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(0);
    f.db.execSync('DROP TRIGGER reject_output_link');
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, artifact));
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, artifact));
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
    expect(f.db.getFirstSync('SELECT current_version_id FROM creative_assets')).toEqual({ current_version_id: null });
    expect(f.db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
  } finally { f.db.close(); }
});
