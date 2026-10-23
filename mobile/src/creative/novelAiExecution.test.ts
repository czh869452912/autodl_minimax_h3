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
import { parseNovelAiResponse } from './novelAiProtocol';
import { readDraftInputs } from './drafts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

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

// Opt-in, offline replay of the saved real response. Never reads credentials or sends HTTP.
(process.env.CREATIVE_LIVE_EVIDENCE ? test : test.skip)('saved live image archives once and becomes a hash-pinned H3 reference', async () => {
  const folder = path.resolve(process.env.CREATIVE_LIVE_EVIDENCE!);
  const raw = fs.readFileSync(path.join(folder, 'novelai.response.json'), 'utf8');
  const [image] = parseNovelAiResponse(raw);
  const bytes = Buffer.from(image.image, 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const evidence = JSON.parse(fs.readFileSync(path.join(folder, 'novelai.evidence.json'), 'utf8'));
  expect(hash).toBe(evidence.sha256);
  expect(createHash('sha256').update(fs.readFileSync(path.join(folder, 'observatory.png'))).digest('hex')).toBe(hash);
  const f = await fixture();
  try {
    f.db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,1,1)', hash, bytes.length, 'image/png', 'observatory.png');
    (f.store.importResponse as jest.Mock).mockResolvedValue([{ hash, seed: image.seed, index: 0 }]);
    await f.handle('SUBMIT'); await f.handle('STATUS_SYNC');
    expect((await f.jobs.get(f.task.id))?.status).toBe('SUCCEEDED');
    const operation = f.db.getFirstSync<{ payload_json: string }>("SELECT payload_json FROM workflow_operations WHERE kind='ARTIFACT_DOWNLOAD'")!;
    const artifact = JSON.parse(operation.payload_json).artifact;
    const commit = { jobId: f.task.id, artifact, blob: { sha256: hash }, now: 300 };
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, commit as never));
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, commit as never));
    const draft = (await f.service.draft(f.draft.id))!;
    const versions = await f.service.versions(draft.target_asset_id!);
    expect(versions).toHaveLength(1);
    expect((versions[0].recipe.input as { seed: number }).seed).toBe(image.seed);
    const video = await f.service.execute({ name: 'draft.createVideo', payload: { versionId: versions[0].id, prompt: 'slow camera movement' } }, 'live-replay-video');
    if (video.status !== 'completed') throw new Error('Expected completed');
    const refs = await readDraftInputs(f.db as never, video.value.draftId);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ version_id: versions[0].id, blob_sha256: hash, state: 'AVAILABLE', byte_size: bytes.length });
    expect(f.db.getFirstSync('SELECT current_version_id FROM creative_assets')).toEqual({ current_version_id: null });
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    fs.writeFileSync(path.join(folder, 'archive-replay.evidence.json'), JSON.stringify({
      mode: 'offline-response-replay-real-sqlite', sha256: hash, actualSeed: image.seed,
      duplicateArchiveVersionCount: versions.length, h3ReferencePinned: true, candidateAutoAdopted: false,
      foreignKeyViolations: 0, androidUiTested: false, at: new Date().toISOString(),
    }, null, 2));
  } finally { f.db.close(); }
});
