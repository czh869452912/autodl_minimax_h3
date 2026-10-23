import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget } from './budget';
import { defaultNovelAiDraft, prepareNovelAiRequest } from './novelAiProtocol';
import { submitCreativeVideo } from './videoSubmission';
import { createNovelAiAdapter, type NovelAiResponseStore } from './novelAiAdapter';
import { bindCreativeAdapter, readCreativeJobBinding } from './boundExecution';
import { recoverNovelAiResponses } from './novelAiRecovery';
import { createJobStateRepository } from '../tasks/jobStateStore';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createDurableExecutor } from '../workflows/executor/durableExecutor';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { quarantineRestoredExecution } from '../storage/restoreIsolation';
import { archiveCreativeOutput } from './archiveOutput';
import { withWriteTransaction } from '../storage/sqliteBusy';

async function fixture() {
  const db = createInitializedRealSqliteTestDb(), service = createCreativeService(db as never);
  const input = { ...defaultNovelAiDraft, prompt: 'an observatory', seed: 12 };
  const result = await service.execute({ name: 'draft.createImage', payload: { input } }, 'image-draft');
  if (result.status !== 'completed') throw new Error('Expected completed');
  const draft = (await service.draft(result.value.draftId))!;
  const secrets = new Map<string,string>();
  const accounts = createCreativeAccounts(db as never, { now: () => 100, verify: async () => ({ namespace: 'novelai' }), secrets: { get: async k => secrets.get(k) ?? null, set: async (k,v) => { secrets.set(k,v); }, remove: async k => { secrets.delete(k); } } });
  const identity = await accounts.connect('novelai', 'private-token');
  const auth = await createCreativeBudget(db as never, () => 100).grant({ provider: 'novelai', generationId: identity.generationId, operations: ['image.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: 10000 });
  const request = prepareNovelAiRequest(input);
  const prepared = { workflowId: draft.workflow_id, workflowVersion:'1', workflowContentHash: 'h', adapterId: 'novelai-image', adapterVersion:'1', inputSnapshot: request.snapshot, requestInput: JSON.parse(request.requestJson), target: { operation: 'image.generate' } };
  const task = await submitCreativeVideo(db as never, { draftId: draft.id, expectedRevision: 0, draftInputJson: draft.input_json, authorizationId: auth, prepared, images: [], versionIds: [] }, 100);
  const jobs = createJobStateRepository(db as never), operations = createOperationRepository(db as never);
  const hash = 'a'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)', hash, 'image/png', `cas/${hash}`);
  const store: NovelAiResponseStore = { generate: jest.fn(async () => 'file:///response'), lookup: jest.fn(async () => 'file:///response'), importResponse: jest.fn(async () => [{ hash, seed: 77, index: 0 }]) };
  const claim = async (kind: 'SUBMIT'|'STATUS_SYNC') => {
    const op = (await operations.listDue({ kind, now: 200, limit: 10 }))[0];
    return (await operations.claimById(op.id, 'worker', 200, 10000))!;
  };
  const handle = async (kind: 'SUBMIT'|'STATUS_SYNC') => {
    const operation = await claim(kind), binding = (await readCreativeJobBinding(db as never, task.id))!;
    const adapter = bindCreativeAdapter(db as never, createNovelAiAdapter(task.id, 'private-token', store), binding, identity, operation, 'worker', () => 200);
    const adapters = new Map([['novelai-image',adapter]]);
    const executor = createDurableExecutor({ jobs, operations, adapters, runtime: createWorkflowRuntime({ adapters }), credentials: { get: async () => ({ ok:true }) }, now: () => 200 });
    await executor.handle(operation, 'worker');
  };
  return { db, service, task, jobs, operations, store, handle, draft, hash };
}

test('NovelAI executes through shared queue and actual seed archives without adopting candidate', async () => {
  const f = await fixture();
  try {
    await f.handle('SUBMIT'); await f.handle('STATUS_SYNC');
    expect((await f.jobs.get(f.task.id))?.status).toBe('SUCCEEDED');
    expect(f.store.generate).toHaveBeenCalledTimes(1);
    const output = f.db.getFirstSync<{payload_json:string}>("SELECT payload_json FROM workflow_operations WHERE kind='ARTIFACT_DOWNLOAD'")!;
    const artifact = JSON.parse(output.payload_json).artifact;
    expect(artifact.metadata.seed).toBe(77);
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, { jobId:f.task.id,artifact,blob:{sha256:f.hash},now:300 } as never));
    const draft = (await f.service.draft(f.draft.id))!;
    const versions = await f.service.versions(draft.target_asset_id!);
    expect((versions[0].recipe.input as {seed:number}).seed).toBe(77);
    const next = await f.service.execute({ name:'draft.createImage',payload:{fromVersionId:versions[0].id}},'continue');
    if (next.status !== 'completed') throw new Error('Expected completed');
    expect(JSON.parse((await f.service.draft(next.value.draftId))!.input_json).seed).toBe(77);
    expect(f.db.getFirstSync('SELECT current_version_id FROM creative_assets')).toEqual({current_version_id:null});
  } finally { f.db.close(); }
});

test('saved response after handle persistence failure resumes locally with no generation replay', async () => {
  const f = await fixture();
  try {
    f.db.execSync("CREATE TRIGGER fail_handle BEFORE UPDATE OF provider_handle_json ON workflow_jobs WHEN NEW.provider_handle_json IS NOT NULL BEGIN SELECT RAISE(ABORT,'injected'); END");
    await f.handle('SUBMIT');
    expect((await f.jobs.get(f.task.id))?.status).toBe('UNKNOWN');
    f.db.execSync('DROP TRIGGER fail_handle');
    expect(await recoverNovelAiResponses(f.db as never, f.jobs, f.store, 200)).toBe(1);
    expect(await recoverNovelAiResponses(f.db as never, f.jobs, f.store, 200)).toBe(0);
    await f.handle('STATUS_SYNC');
    expect(f.store.generate).toHaveBeenCalledTimes(1);
    expect(f.store.importResponse).toHaveBeenCalledTimes(1);
  } finally { f.db.close(); }
});

test('missing response remains unknown and restoring backup never resumes the request', async () => {
  const f = await fixture();
  try {
    (f.store.generate as jest.Mock).mockRejectedValue(new Error('timeout'));
    (f.store.lookup as jest.Mock).mockResolvedValue(null);
    await f.handle('SUBMIT');
    expect(await recoverNovelAiResponses(f.db as never, f.jobs, f.store, 200)).toBe(0);
    quarantineRestoredExecution(f.db as never,'b'.repeat(32));
    (f.store.lookup as jest.Mock).mockResolvedValue('file:///response');
    expect(await recoverNovelAiResponses(f.db as never, f.jobs, f.store, 200)).toBe(0);
    expect(f.store.generate).toHaveBeenCalledTimes(1);
  } finally { f.db.close(); }
});
