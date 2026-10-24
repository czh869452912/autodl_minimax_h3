import {resolveCreativeQueryCredential} from './queryCredential';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget } from './budget';
import { readSubmittedCreativeDraft, submitCreativeVideo } from './videoSubmission';
import { bindCreativeAdapter, readCreativeJobBinding } from './boundExecution';
import { archiveCreativeOutput } from './archiveOutput';
import { H3_CREATIVE_WORKFLOW_ID as H3_WORKFLOW_ID } from './videoWorkflow';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createTaskRepository } from '../tasks/repository';
import { quarantineRestoredExecution } from '../storage/restoreIsolation';
import type { WorkflowOperation } from '../workflows/executor/types';
import type { ProviderAdapter } from '../workflows/providers/registry';
import {createTaskCommandService} from '../tasks/taskCommandService';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeAutodlStatus, parseAutodlResult } from '../workflows/providers/autodl/mapping';

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

test('mixed image/audio inputs are pinned into the task and rejected atomically if their bytes change',async()=>{
  const f=await fixture();
  try{
    const media=[];
    for(const [kind,mime,char] of [['image','image/png','a'],['audio','audio/wav','b']] as const){
      const sha256=char.repeat(64);f.db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',sha256,mime,`cas/${sha256}`);
      const result=await f.service.execute({name:'asset.import',payload:{title:kind,kind,blobSha256:sha256}},`import-${kind}`);
      if(result.status!=='completed')throw new Error('Expected asset');
      media.push({uri:`asset://${sha256}`,sha256,mime,size:10,name:result.value.versionId});
    }
    await f.service.execute({name:'draft.replaceVideoMedia',payload:{id:f.draft.id,expectedRevision:0,imageVersionIds:[media[0].name],audioVersionIds:[media[1].name]}},'references');
    const draft=(await f.service.draft(f.draft.id))!,snapshot={...f.input.prepared.inputSnapshot,images:[media[0]],audios:[media[1]]};
    const input={...f.input,expectedRevision:draft.revision,draftInputJson:draft.input_json,images:[media[0]],audios:[media[1]],versionIds:[media[1].name,media[0].name],prepared:{...f.input.prepared,inputSnapshot:snapshot,requestInput:snapshot}};
    await expect(submitCreativeVideo(f.db as never,{...input,audios:[{...media[1],sha256:'changed'}]},100)).rejects.toThrow('DRAFT_INPUT_CHANGED');
    expect(f.db.getAllSync('SELECT id FROM workflow_jobs')).toEqual([]);
    const task=await submitCreativeVideo(f.db as never,input,100);
    expect(f.db.getAllSync('SELECT slot,version_id FROM creative_job_inputs WHERE job_id=? ORDER BY slot',task.id)).toEqual([{slot:'audio',version_id:media[1].name},{slot:'image',version_id:media[0].name}]);
    const persisted=f.db.getFirstSync<{audios_json:string}>('SELECT audios_json FROM tasks WHERE id=?',task.id)!;
    expect(JSON.parse(persisted.audios_json)).toEqual([media[1]]);
    expect(JSON.parse(f.db.getFirstSync<{input_json:string}>('SELECT input_json FROM workflow_jobs WHERE id=?',task.id)!.input_json)).toEqual(snapshot);
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});

(process.env.CREATIVE_LIVE_EVIDENCE ? test : test.skip)('saved live H3 output archives once with verified original bytes', async () => {
  const folder = path.resolve(process.env.CREATIVE_LIVE_EVIDENCE!);
  const status = JSON.parse(fs.readFileSync(path.join(folder, 'autodl.status.json'), 'utf8'));
  expect(normalizeAutodlStatus(status.status)).toBe('SUCCEEDED');
  const artifacts = parseAutodlResult({ results: status.results });
  expect(artifacts.filter(a => a.kind === 'video')).toHaveLength(1);
  const bytes = fs.readFileSync(path.join(folder, 'observatory.mp4'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const evidence = JSON.parse(fs.readFileSync(path.join(folder, 'autodl.evidence.json'), 'utf8'));
  expect(hash).toBe(evidence.video.sha256);
  expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
  const f = await fixture();
  try {
    const task = await f.submit();
    f.db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,1,1)', hash, bytes.length, 'video/mp4', 'observatory.mp4');
    const commit = { jobId: task.id, artifact: artifacts.find(a => a.kind === 'video')!, blob: { sha256: hash }, now: 200 };
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, commit as never));
    await withWriteTransaction(f.db as never, tx => archiveCreativeOutput(tx, commit as never));
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
    expect(f.db.getFirstSync('SELECT current_version_id FROM creative_assets')).toEqual({ current_version_id: null });
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    fs.writeFileSync(path.join(folder, 'video-archive-replay.evidence.json'), JSON.stringify({
      mode: 'offline-response-replay-real-sqlite', sha256: hash, duplicateArchiveVersionCount: 1,
      candidateAutoAdopted: false, foreignKeyViolations: 0, androidUiTested: false, at: new Date().toISOString(),
    }, null, 2));
  } finally { f.db.close(); }
});

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
test('unknown creative requests cannot escape account binding through legacy replacement',async()=>{
  const f=await fixture();try{
    const task=await f.submit();f.db.runSync("UPDATE workflow_jobs SET status='UNKNOWN' WHERE id=?",task.id);
    const commands=createTaskCommandService({db:f.db as never,fileExists:async()=>false,resolveCasUri:p=>p});
    await expect(commands.replaceUnknownAfterConfirmation(task.id)).rejects.toThrow('重新授权');
    const result=await f.service.execute({name:'draft.copySubmitted',payload:{id:f.draft.id}},'copy');
    expect(result).toMatchObject({status:'completed',value:{supersedesJobId:task.id,provider:'autodl'}});
    if(result.status!=='completed')throw new Error('expected');
    const copied=await f.service.draft(result.value.draftId);
    expect(copied).toMatchObject({state:'EDITING',job_id:null,input_json:f.draft.input_json});
    expect(await f.service.execute({name:'draft.copySubmitted',payload:{id:f.draft.id}},'copy')).toEqual(result);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_authorizations')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
  }finally{f.db.close();}
});

test('agent replay returns original job after restart or restore, without new seed, authorization or dispatch', async () => {
  const f = await fixture();
  try {
    f.db.runSync("INSERT INTO creative_projects VALUES('project','p','',0,NULL,1,1)");
    f.db.runSync("UPDATE creative_generation_drafts SET project_id='project'");
    f.db.runSync("UPDATE creative_authorizations SET project_id='project'");
    f.db.runSync("INSERT INTO agent_runs VALUES('thread','run',0,'{\"status\":\"running\"}')");
    f.db.runSync("INSERT INTO creative_agent_scopes VALUES('thread','project',0,1)");
    const origin = {threadId:'thread',runId:'run',toolCallId:'call',projectId:'project',scopeRevision:0};
    expect(await readSubmittedCreativeDraft(f.db as never,f.draft.id,f.input.authorizationId,origin)).toBeNull();
    const task=await f.submit();
    expect(await readSubmittedCreativeDraft(f.db as never,f.draft.id,f.input.authorizationId,origin)).toBe(task.id);
    quarantineRestoredExecution(f.db as never,'c'.repeat(32));
    expect(await readSubmittedCreativeDraft(f.db as never,f.draft.id,f.input.authorizationId,origin)).toBe(task.id);
    await expect(readSubmittedCreativeDraft(f.db as never,f.draft.id,'different',origin)).rejects.toThrow('AUTHORIZATION_CONFLICT');
    await expect(f.service.execute({name:'project.create',payload:{title:'other'}},'other')).resolves.toBeDefined();
    f.db.runSync("UPDATE creative_agent_scopes SET project_id=(SELECT id FROM creative_projects WHERE title='other')");
    await expect(readSubmittedCreativeDraft(f.db as never,f.draft.id,f.input.authorizationId,origin)).rejects.toThrow('SCOPE_CHANGED');
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
  } finally {f.db.close();}
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


test('late project archive or target trash rejects submission without a job or reservation', async () => {
  const f=await fixture();try {
    f.db.runSync("INSERT INTO creative_projects VALUES('project','p','',0,1,1,1)");
    f.db.runSync("UPDATE creative_generation_drafts SET project_id='project'");
    await expect(f.submit()).rejects.toThrow('PROJECT_NOT_AVAILABLE');
    f.db.runSync("UPDATE creative_generation_drafts SET project_id=NULL");
    f.db.runSync("INSERT INTO creative_assets VALUES('target','video','target',NULL,0,1,1)");
    f.db.runSync("UPDATE creative_generation_drafts SET target_asset_id='target'");
    f.db.runSync("INSERT INTO creative_asset_trash VALUES('target','user',1)");
    await expect(f.submit()).rejects.toThrow('TARGET_ASSET_TRASHED');
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(0);
    f.db.runSync('DELETE FROM creative_asset_trash');
    await f.submit();
    f.db.runSync("INSERT INTO creative_asset_trash VALUES('target','user',1)");
    await expect(f.service.execute({name:'draft.copySubmitted',payload:{id:f.draft.id}},'copy-trashed')).rejects.toThrow('TARGET_ASSET_TRASHED');
    expect(f.db.getAllSync('SELECT * FROM creative_generation_drafts')).toHaveLength(1);
  }finally{f.db.close();}
});


test('verified redownload restores missing output state, rejects different bytes and preserves version identity',async()=>{
  const f=await fixture();try{
    const task=await f.submit(),hash='d'.repeat(64);
    f.db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'video/mp4','cas/restored');
    const input={jobId:task.id,artifact:{id:'clip',kind:'video'},blob:{sha256:hash},now:200} as Parameters<typeof archiveCreativeOutput>[1];
    await withWriteTransaction(f.db as never,tx=>archiveCreativeOutput(tx,input));
    const before=f.db.getFirstSync('SELECT id FROM creative_asset_versions');
    f.db.runSync("UPDATE creative_file_resources SET state='MISSING',error_code='missing'");
    await expect(withWriteTransaction(f.db as never,tx=>archiveCreativeOutput(tx,{...input,blob:{...input.blob,sha256:'e'.repeat(64)}}))).rejects.toThrow('CONTENT_CHANGED');
    expect(f.db.getFirstSync('SELECT state FROM creative_version_files')).toEqual({state:'MISSING'});
    await withWriteTransaction(f.db as never,tx=>archiveCreativeOutput(tx,input));
    expect(f.db.getFirstSync('SELECT state,error_code FROM creative_file_resources')).toEqual({state:'AVAILABLE',error_code:null});
    expect(f.db.getFirstSync('SELECT id FROM creative_asset_versions')).toEqual(before);
    expect(f.db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(1);
  }finally{f.db.close();}
});


test('legacy source refresh for creative tasks resolves the original query account, never a replacement default',async()=>{
  const f=await fixture();try{
    const task=await f.submit();await f.accounts.connect('autodl','replacement-secret');
    const resolve=jest.fn((id:string,use:'query')=>f.accounts.resolveExact(id,use));
    const result=await resolveCreativeQueryCredential(f.db as never,task.id,resolve);
    expect(result?.token).toBe('original-secret');expect(resolve).toHaveBeenCalledWith(f.identity.generationId,'query');
    await expect(resolveCreativeQueryCredential(f.db as never,task.id,async()=>({token:'wrong',accountId:'other',generationId:'other',provider:'autodl'}))).rejects.toThrow('IDENTITY_MISMATCH');
    await f.accounts.disconnect('autodl');
    await expect(resolveCreativeQueryCredential(f.db as never,task.id,resolve)).rejects.toThrow('INACTIVE');
    expect(await resolveCreativeQueryCredential(f.db as never,'unbound-legacy',resolve)).toBeNull();
  }finally{f.db.close();}
});


test('legacy drafts with the remote H3 id submit through the local catalog identity', async () => {
  const f = await fixture();
  try {
    f.db.runSync("UPDATE creative_generation_drafts SET workflow_id='minimax_h3_image_audio_to_video_v2_15s' WHERE id=?", f.draft.id);
    const job = await f.submit();
    expect(job.workflowId).toBe('autodl.minimax-h3.i2v-15s');
    expect((await f.service.draft(f.draft.id))?.state).toBe('SUBMITTED');
  } finally { f.db.close(); }
});
