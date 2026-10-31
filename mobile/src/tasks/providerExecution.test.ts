import {grantOutboundConsent} from '../creative/outboundConsent';
import {creativeRequestHash} from '../creative/videoSubmission';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from '../creative/service';
import { createCreativeAccounts } from '../creative/accounts';
import { createCreativeBudget } from '../creative/budget';
import { submitCreativeVideo } from '../creative/videoSubmission';
import { persistSubmissionCommand } from '../create/submissionCommand';
import { createJobStateRepository } from './jobStateStore';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createApplicationProviderRegistry, type ApplicationProviderRegistration } from '../providers/applicationRegistry';
import { createProviderExecution } from './providerExecution';
import { createMonitorQueue } from './monitorQueue';
import { createExecutorTick } from '../workflows/executor/tick';
import { recoverUnsentCreativeJobs } from '../creative/unsentRecovery';
import { novelAiBodyHash, novelAiKey } from '../creative/novelAiAdapter';
import * as responseStores from '../creative/novelAiResponseStore';
import { defaultNovelAiDraft } from '../creative/novelAiProtocol';
import { autodlComfyUiManifest } from '../workflows/providers/autodl/manifest';
import { H3_CREATIVE_WORKFLOW_ID } from '../creative/videoWorkflow';
import type { PreparedWorkflowSubmission } from '../workflows/runtime/runtime';

const prepared: PreparedWorkflowSubmission = { workflowId: 'extra.workflow', workflowVersion: '1', workflowContentHash: 'h', adapterId: 'extra-video', adapterVersion: '1', inputSnapshot: { prompt: 'pan' }, requestInput: { prompt: 'pan' }, target: { operation: 'video.generate' } };
const original = { provider: 'extra', accountId: 'a', generationId: 'g', token: 'original-secret' };
const mockTransport = jest.fn();
jest.mock('../providers/httpTransport', () => ({ getNativeHttpTransport: () => mockTransport }));
beforeEach(() => mockTransport.mockReset());

function fixture(registrations: ApplicationProviderRegistration[] = []) {
  const db = createInitializedRealSqliteTestDb(), jobs = createJobStateRepository(db as never), operations = createOperationRepository(db as never);
  const resolveExact = jest.fn(async (_id: string, _use: 'dispatch' | 'query') => original), resolveLegacyDefault = jest.fn(async () => ({ ...original, token: 'different-default-secret' }));
  const providers = createApplicationProviderRegistry(db as never, registrations);
  const execution = createProviderExecution({ db: db as never, jobs, operations, providers, resolveExact, resolveLegacyDefault, now: () => 100 });
  const run = async (id: string) => {
    const operation = await operations.claimById(id, 'worker', 100, 1000);
    if (!operation) throw new Error('expected claimed operation');
    await execution.handle(operation, 'worker');
  };
  return { db, jobs, operations, execution, resolveExact, resolveLegacyDefault, run };
}

async function creativeVideo(f: ReturnType<typeof fixture>) {
  const service = createCreativeService(f.db as never), secrets = new Map<string, string>();
  const accounts = createCreativeAccounts(f.db as never, { now: () => 1, verify: async () => ({ namespace: 'autodl', authenticated: false }), secrets: { get: async k => secrets.get(k) ?? null, set: async (k, v) => { secrets.set(k, v); }, remove: async k => { secrets.delete(k); } } });
  const identity = await accounts.connect('autodl', 'original-secret');
  f.resolveExact.mockImplementation((id, use) => accounts.resolveExact(id, use));
  const authorizationId = await createCreativeBudget(f.db as never, () => 1).grant({ provider: 'autodl', generationId: identity.generationId, operations: ['video.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: 10000 });
  const draft = await service.execute({ name: 'draft.createVideo', payload: { prompt: 'pan' } }, 'draft');
  if (draft.status !== 'completed') throw new Error('expected draft');
  const saved = (await service.draft(draft.value.draftId))!;
  const input = { prompt: 'pan', resolution: '768p竖', duration: 5 };
  await grantOutboundConsent(f.db as never,{projectId:null,provider:'autodl',generationId:identity.generationId,requestHash:creativeRequestHash({ ...prepared, workflowId: H3_CREATIVE_WORKFLOW_ID, adapterId: 'autodl-comfyui', inputSnapshot: input, requestInput: input, target: { operation: 'workflow.submit' } }),versions:[]},1);
  const task = await submitCreativeVideo(f.db as never, { draftId: saved.id, expectedRevision: saved.revision, draftInputJson: saved.input_json, authorizationId, prepared: { ...prepared, workflowId: H3_CREATIVE_WORKFLOW_ID, adapterId: 'autodl-comfyui', inputSnapshot: input, requestInput: input, target: { operation: 'workflow.submit' } }, images: [], versionIds: [] }, 1);
  return { accounts, task };
}

test('creative requests keep authorization, original-account polling and held unknown costs on the shared execution path', async () => {
  const f = fixture();
  try {
    mockTransport.mockImplementation(async (_url: unknown, init: RequestInit) => new Response(JSON.stringify({ code: 'Success', data: init.method === 'POST' ? { task_id: 'remote' } : { status: 'SUCCESSFUL', results: [] } }), { status: 200 }));
    const { task, accounts } = await creativeVideo(f);
    await f.run(task.id + ':submit');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({ state: 'DISPATCHED' });
    await accounts.connect('autodl', 'replacement-secret');
    await f.run(f.operations.list('STATUS_SYNC')[0].id);
    expect(mockTransport).toHaveBeenCalledTimes(2);
    for (const [, init] of mockTransport.mock.calls) expect(init.headers.Authorization).toBe('original-secret');
    expect(f.resolveLegacyDefault).not.toHaveBeenCalled();
    expect((await f.jobs.get(task.id))?.status).toBe('SUCCEEDED');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({ state: 'UNKNOWN_HELD' });
  } finally { f.db.close(); }
});

test('a credential failure before creative dispatch releases the reservation and sends nothing', async () => {
  const f = fixture();
  try {
    const { task } = await creativeVideo(f); f.resolveExact.mockRejectedValueOnce(new Error('CREDENTIAL_INACTIVE'));
    await f.run(task.id + ':submit');
    expect(mockTransport).not.toHaveBeenCalled(); expect(f.resolveLegacyDefault).not.toHaveBeenCalled();
    expect((await f.jobs.get(task.id))?.status).toBe('FAILED');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({ state: 'RELEASED' });
    const notifications=await createMonitorQueue(f.db as never).read(0);
    expect(notifications.events).toEqual([expect.objectContaining({taskId:task.id,status:'FAILED'})]);
  } finally { f.db.close(); }
});

test('an additional provider dispatches and polls through the shared executor without resolving a default account', async () => {
  const submit = jest.fn(async () => ({ remoteId: 'remote' })), getStatus = jest.fn(async () => ({ status: 'RUNNING' as const, artifacts: [] }));
  const create = jest.fn((_context: { jobId: string; token: string }) => ({ manifest: () => ({ id: 'extra-video', adapterVersion: '1', platforms: ['extra'], capabilities: ['video.generate'], credentialKinds: ['extra-token'], operations: ['video.generate'], supportedArtifactKinds: ['video' as const] }), validateCredentials: async () => ({ ok: true }), submit, getStatus }));
  const f = fixture([{ manifest: { ...autodlComfyUiManifest, id: 'extra-video' }, provider: 'extra', statusSource: 'remote', create }]);
  try {
    const { accountId, generationId, provider } = original;
    const task = await persistSubmissionCommand(f.db as never, 'extra', prepared, { images: [], audios: [], credentialBinding: { accountId, generationId, provider } }, 1);
    await f.run(task.id + ':submit');
    const status = f.operations.list('STATUS_SYNC')[0]; await f.run(status.id);
    expect(submit).toHaveBeenCalledTimes(1); expect(getStatus).toHaveBeenCalledWith({ remoteId: 'remote' });
    expect(f.resolveExact.mock.calls).toEqual([['g', 'dispatch'], ['g', 'query']]);
    expect(f.resolveLegacyDefault).not.toHaveBeenCalled();
    for (const [context] of create.mock.calls) expect(context).toEqual({ jobId: task.id, token: 'original-secret' });
    expect((await f.jobs.get(task.id))?.status).toBe('RUNNING');
  } finally { f.db.close(); }
});

test('a busy database during exact credential resolution retries without failing the job or sending twice',async()=>{
  const f=fixture();
  const clock=jest.spyOn(Date,'now').mockReturnValue(100);
  try{
    const {task}=await creativeVideo(f);
    f.resolveExact.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const tick=createExecutorTick({operations:f.operations,executor:f.execution,owner:()=> 'worker',isReadonly:()=>false});
    expect(await tick.run({reason:'foreground',now:100,maxOperations:1})).toMatchObject({retried:1,failed:0});
    expect((await f.jobs.get(task.id))?.status).toBe('READY_TO_SUBMIT');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({state:'RESERVED'});
    expect(mockTransport).not.toHaveBeenCalled();
    mockTransport.mockResolvedValue(new Response(JSON.stringify({code:'Success',data:{task_id:'remote'}}),{status:200}));
    const next=(await f.operations.get(task.id+':submit'))!.nextRetryAt;
    expect(await tick.run({reason:'foreground',now:next,maxOperations:1})).toMatchObject({succeeded:1,failed:0});
    expect((await f.jobs.get(task.id))?.status).toBe('QUEUED');
    expect(mockTransport).toHaveBeenCalledTimes(1);
    expect((await createMonitorQueue(f.db as never).read(0)).events).toEqual([]);
  }finally{clock.mockRestore();f.db.close();}
});

test('a blocked unsent creative request ends locally and releases its reservation instead of occupying the workbench forever',async()=>{
  const f=fixture();
  try{
    const {task}=await creativeVideo(f);
    f.db.runSync("UPDATE workflow_operations SET state='BLOCKED',last_error_json=? WHERE job_id=?",JSON.stringify({code:'EXECUTOR_UNEXPECTED_ERROR'}),task.id);
    await recoverUnsentCreativeJobs(f.db as never,100);
    expect((await f.jobs.get(task.id))?.status).toBe('FAILED');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({state:'RELEASED'});
    expect((await f.operations.get(task.id+':submit'))?.state).toBe('FAILED');
    expect((await createMonitorQueue(f.db as never).read(0)).events).toEqual([expect.objectContaining({taskId:task.id,status:'FAILED'})]);
    expect(mockTransport).not.toHaveBeenCalled();
  }finally{f.db.close();}
});

test('unsent recovery leaves a job alone if dispatch progressed after its candidate scan',async()=>{
  const f=fixture();
  try{
    const {task}=await creativeVideo(f);
    f.db.runSync("UPDATE workflow_operations SET state='BLOCKED' WHERE job_id=?",task.id);
    const scan=f.db.getAllAsync.bind(f.db);
    jest.spyOn(f.db,'getAllAsync').mockImplementation(async(sql:string,...params:unknown[])=>{
      const rows=await scan(sql,...params as never[]);
      if(sql.includes('SELECT r.id,r.job_id')){
        f.db.runSync("UPDATE workflow_jobs SET status='SUBMITTING',revision=revision+1 WHERE id=?",task.id);
        f.db.runSync("UPDATE creative_budget_reservations SET state='DISPATCHED' WHERE job_id=?",task.id);
      }
      return rows;
    });
    await recoverUnsentCreativeJobs(f.db as never,100);
    expect((await f.jobs.get(task.id))?.status).toBe('SUBMITTING');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({state:'DISPATCHED'});
    expect((await createMonitorQueue(f.db as never).read(0)).events).toEqual([]);
  }finally{f.db.close();}
});

test('unsent recovery completes cleanup after a crash between the job transition and reservation release',async()=>{
  const f=fixture();
  try{
    const {task}=await creativeVideo(f);
    f.db.runSync("UPDATE workflow_jobs SET status='FAILED',revision=revision+1 WHERE id=?",task.id);
    f.db.runSync("UPDATE workflow_operations SET state='BLOCKED' WHERE job_id=?",task.id);
    await recoverUnsentCreativeJobs(f.db as never,100);
    await recoverUnsentCreativeJobs(f.db as never,101);
    expect((await f.jobs.get(task.id))?.status).toBe('FAILED');
    expect((await f.operations.get(task.id+':submit'))?.state).toBe('FAILED');
    expect(f.db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({state:'RELEASED'});
    expect(mockTransport).not.toHaveBeenCalled();
  }finally{f.db.close();}
});

test('a creative context missing its reservation cannot fall back to the legacy default or send HTTP', async () => {
  const f = fixture();
  try {
    const task = await persistSubmissionCommand(f.db as never, 'orphan', { ...prepared, adapterId: 'autodl-comfyui' }, { images: [], audios: [] }, 1);
    const service = createCreativeService(f.db as never), result = await service.execute({ name: 'draft.createVideo', payload: { prompt: 'p' } }, 'draft');
    if (result.status !== 'completed') throw new Error('expected draft');
    f.db.runSync("INSERT INTO creative_assets VALUES('asset','video','v',NULL,0,1,1)");
    f.db.runSync('INSERT INTO creative_job_contexts VALUES(?,?,0,NULL,NULL,?,?,?,NULL,?,1)', task.id, result.value.draftId, 'asset', '{}', 'h', 'epoch');
    await f.run(task.id + ':submit');
    expect(f.resolveExact).not.toHaveBeenCalled(); expect(f.resolveLegacyDefault).not.toHaveBeenCalled();
    expect((await f.jobs.get(task.id))?.status).toBe('FAILED');
    expect(f.operations.list('SUBMIT')[0].state).toBe('FAILED');
  } finally { f.db.close(); }
});

test('a database read failure propagates to runner recovery without changing a queued job to FAILED', async () => {
  const f = fixture();
  try {
    const task = await persistSubmissionCommand(f.db as never, 'db-failure', { ...prepared, adapterId: 'autodl-comfyui' }, { images: [], audios: [] }, 1);
    const read = f.db.getFirstAsync.bind(f.db);
    jest.spyOn(f.db, 'getFirstAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('FROM creative_job_contexts')) throw new Error('SQLITE_BUSY');
      return read(sql, ...params as never[]);
    });
    await expect(f.run(task.id + ':submit')).rejects.toThrow('SQLITE_BUSY');
    expect((await f.jobs.get(task.id))?.status).toBe('READY_TO_SUBMIT');
    expect(f.resolveExact).not.toHaveBeenCalled(); expect(f.resolveLegacyDefault).not.toHaveBeenCalled(); expect(mockTransport).not.toHaveBeenCalled();
  } finally { jest.restoreAllMocks(); f.db.close(); }
});

test('NovelAI polling consumes a persisted native receipt after account disconnect, without resolving any credential', async () => {
  const f = fixture();
  try {
    const store = { generate: jest.fn(), lookup: jest.fn(async () => 'local-receipt'), importResponse: jest.fn(async () => [{ hash: 'a'.repeat(64), seed: 1, index: 0 }]) };
    jest.spyOn(responseStores, 'novelAiResponseStore').mockReturnValue(store);
    const service = createCreativeService(f.db as never), draft = await service.execute({ name: 'draft.createImage', payload: { input: { ...defaultNovelAiDraft, prompt: 'scene' } } }, 'draft');
    if (draft.status !== 'completed') throw new Error('expected draft');
    const secrets = new Map<string, string>();
    const accounts = createCreativeAccounts(f.db as never, { now: () => 1, verify: async () => ({ namespace: 'novelai' }), secrets: { get: async k => secrets.get(k) ?? null, set: async (k, v) => { secrets.set(k, v); }, remove: async k => { secrets.delete(k); } } });
    const identity = await accounts.connect('novelai', 'original-secret');
    const authorizationId = await createCreativeBudget(f.db as never, () => 1).grant({ provider: 'novelai', generationId: identity.generationId, operations: ['image.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: 10000 });
    const imagePrepared = { ...prepared, workflowId: 'novelai-image-basic', adapterId: 'novelai-image', requestInput: { parameters: { n_samples: 1 } }, target: { operation: 'image.generate' } };
    const saved = (await service.draft(draft.value.draftId))!;
    const task = await submitCreativeVideo(f.db as never, { draftId: saved.id, expectedRevision: saved.revision, draftInputJson: saved.input_json, authorizationId, prepared: imagePrepared, images: [], versionIds: [] }, 1);
    const handle = { kind: 'novelai-local-response', key: novelAiKey(task.id), requestHash: novelAiBodyHash(imagePrepared.requestInput), expectedImages: 1 };
    f.db.runSync("UPDATE workflow_jobs SET status='QUEUED',provider_handle_json=? WHERE id=?", JSON.stringify(handle), task.id);
    f.db.runSync("UPDATE creative_budget_reservations SET state='DISPATCHED' WHERE job_id=?", task.id);
    f.operations.enqueue({ id: 'poll', kind: 'STATUS_SYNC', jobId: task.id, idempotencyKey: 'poll', payload: {}, now: 1 });
    await accounts.disconnect('novelai');
    await f.run('poll');
    expect(f.resolveExact).not.toHaveBeenCalled(); expect(f.resolveLegacyDefault).not.toHaveBeenCalled();
    expect(store.lookup).toHaveBeenCalledWith(handle.key, handle.requestHash);
    expect(store.generate).not.toHaveBeenCalled();
    expect((await f.jobs.get(task.id))?.status).toBe('SUCCEEDED');
  } finally { jest.restoreAllMocks(); f.db.close(); }
});
