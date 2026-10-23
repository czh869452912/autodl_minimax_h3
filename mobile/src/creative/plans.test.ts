import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {quarantineRestoredExecution} from '../storage/restoreIsolation';
import type {CreativeCommand} from './types';
import {runCreativePlans,reconcileCreativePlans} from './planRunner';
import {createCreativeAccounts} from './accounts';
import {createCreativeBudget} from './budget';
import {H3_WORKFLOW_ID} from '../workflows/providers/autodl/metadata';
import {submitCreativeVideo} from './videoSubmission';
async function fixture(){
  const db=createInitializedRealSqliteTestDb();let next=0;
  const service=createCreativeService(db as never,{id:()=>`p-${++next}`,now:()=>100});
  const execute=async(command:CreativeCommand,key=`k-${++next}`)=>{const r=await service.execute(command,key);if(r.status!=='completed')throw new Error('expected');return r.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'film'}});
  const {shotId}=await execute({name:'shot.create',payload:{projectId,title:'opening'}});
  const hash='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png',`cas/${hash}`);
  const {assetId,versionId}=await execute({name:'asset.import',payload:{title:'picture',kind:'image',blobSha256:hash,projectId}});
  db.runSync("INSERT INTO creative_asset_versions VALUES('v2',?,2,'generated','{}',2)",assetId);
  db.runSync("INSERT INTO creative_version_files VALUES('v2','original',?,'AVAILABLE')",hash);
  const plan=await execute({name:'plan.createSelection',payload:{projectId,shotId,expectedShotRevision:0,title:'choose then video',candidateVersionIds:[versionId,'v2'],videoPrompt:'slow camera orbit'}});
  const selection:CreativeCommand={name:'plan.resolveSelection',payload:{decisionId:plan.decisionId,versionId:'v2',expectedRevision:0}};
  return {db,service,execute,projectId,shotId,assetId,versionId,plan,selection};
}
test('decision freezes a candidate into shot and video draft, with a single durable resume event',async()=>{
  const f=await fixture();try{
    const result=await f.execute(f.selection,'select');
    expect(await f.execute(f.selection,'select')).toEqual(result);
    await expect(f.execute({...f.selection,payload:{...f.selection.payload,versionId:f.versionId}},'another')).rejects.toThrow('REVISION_CONFLICT');
    expect((await f.service.shots(f.projectId))[0].selected_image).toBe('v2');
    expect((await f.service.assets())[0].currentVersionId).toBe(f.versionId);
    expect(await f.service.draftInputs(result.draftId)).toEqual([expect.objectContaining({version_id:'v2'})]);
    expect(f.db.getAllSync('SELECT * FROM creative_selection_outbox')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    await expect(f.execute({name:'draft.replaceInputs',payload:{id:result.draftId,expectedRevision:0,versionIds:[]}})).rejects.toThrow('PLAN_DRAFT_FROZEN');
    expect(f.db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{f.db.close();}
});

async function runnable(){
  const f=await fixture();const result=await f.execute(f.selection);
  const secrets=new Map<string,string>();
  const accounts=createCreativeAccounts(f.db as never,{now:()=>100,verify:async()=>({namespace:'autodl',authenticated:false}),secrets:{get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}}});
  const identity=await accounts.connect('autodl','private-token');
  const budget=createCreativeBudget(f.db as never,()=>100);
  const authorizationId=await budget.grant({provider:'autodl',generationId:identity.generationId,projectId:f.projectId,operations:['video.generate'],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:10000});
  f.db.runSync('UPDATE creative_plans SET authorization_id=?',authorizationId);
  const draft=(await f.service.draft(result.draftId))!;
  const hash='a'.repeat(64);
  const input={draftId:draft.id,expectedRevision:draft.revision,draftInputJson:draft.input_json,prepared:{workflowId:H3_WORKFLOW_ID,workflowVersion:'1',workflowContentHash:'hash',adapterId:'autodl',adapterVersion:'1',inputSnapshot:{prompt:'slow camera orbit',seed:1},requestInput:{prompt:'slow camera orbit',seed:1},target:{operation:'generate'}},images:[{uri:`asset://${hash}`,sha256:hash,mime:'image/png',size:10,name:'v2'}],versionIds:['v2']};
  return {...f,result,authorizationId,input,prepare:jest.fn(async()=>input)};
}
test('restart and competing consumers submit one job; event and budget commit with step',async()=>{
  const f=await runnable();try{
    await Promise.all([runCreativePlans(f.db as never,f.prepare,200),runCreativePlans(f.db as never,f.prepare,200)]);
    await runCreativePlans(f.db as never,f.prepare,300);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
    expect(f.db.getFirstSync('SELECT consumed_at FROM creative_selection_outbox')).toEqual({consumed_at:200});
    expect(f.db.getFirstSync("SELECT state FROM creative_plan_steps WHERE kind='video'")).toEqual({state:'DISPATCHED'});
  }finally{f.db.close();}
});
test('failure between job creation and step receipt rolls back all consumption; explicit resume succeeds once',async()=>{
  const f=await runnable();try{
    f.db.execSync("CREATE TRIGGER reject_plan_consume BEFORE UPDATE ON creative_selection_outbox BEGIN SELECT RAISE(ABORT,'injected'); END");
    await runCreativePlans(f.db as never,f.prepare,200);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(0);
    expect((await f.service.draft(f.result.draftId))?.state).toBe('EDITING');
    expect(f.db.getFirstSync("SELECT state FROM creative_plan_steps WHERE kind='video'")).toEqual({state:'BLOCKED'});
    f.db.execSync('DROP TRIGGER reject_plan_consume');
    await f.execute({name:'plan.resume',payload:{id:f.plan.planId,expectedRevision:0,authorizationId:f.authorizationId}});
    await runCreativePlans(f.db as never,f.prepare,200);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
  }finally{f.db.close();}
});
test.each(['restore','cancel','expired','switched'] as const)('%s before dispatch sends zero jobs and never consumes the event',async(change)=>{
  const f=await runnable();try{
    if(change==='restore')quarantineRestoredExecution(f.db as never,'d'.repeat(32));
    if(change==='cancel')await f.execute({name:'plan.cancel',payload:{id:f.plan.planId,expectedRevision:0}});
    if(change==='expired')f.db.runSync('UPDATE creative_authorizations SET expires_at=150');
    if(change==='switched')f.db.runSync('DELETE FROM creative_default_accounts');
    await runCreativePlans(f.db as never,f.prepare,200);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(f.db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(0);
    expect(f.db.getFirstSync('SELECT consumed_at FROM creative_selection_outbox')).toEqual({consumed_at:null});
  }finally{f.db.close();}
});
test('ordinary submit cannot bypass a frozen plan and no completion before output archive',async()=>{
  const f=await runnable();try{
    await expect(submitCreativeVideo(f.db as never,{...f.input,authorizationId:f.authorizationId},200)).rejects.toThrow('PLAN_DRAFT_REQUIRES_PLAN_SUBMISSION');
    await runCreativePlans(f.db as never,f.prepare,200);
    f.db.runSync("UPDATE workflow_jobs SET status='SUCCEEDED'");
    await runCreativePlans(f.db as never,f.prepare,300);
    expect(f.db.getFirstSync('SELECT state FROM creative_plans')).toEqual({state:'ACTIVE'});
    const job=f.db.getFirstSync<{id:string}>('SELECT id FROM workflow_jobs')!;
    f.db.runSync("INSERT INTO creative_output_links VALUES(?,'output','v2')",job.id);
    f.prepare.mockClear();
    await reconcileCreativePlans(f.db as never,400);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.db.getFirstSync('SELECT state FROM creative_plans')).toEqual({state:'COMPLETED'});
    expect((await f.service.shots(f.projectId))[0].selected_video).toBeNull();
  }finally{f.db.close();}
});
test('deleted originating chat stops an accepted but unsent plan without deleting its decision',async()=>{
  const f=await runnable();try{
    f.db.runSync("UPDATE creative_execution_origins SET origin_kind='agent',thread_id='deleted-thread',run_id='old-run' WHERE id=(SELECT execution_origin_id FROM creative_command_receipts WHERE command_name='plan.createSelection')");
    await runCreativePlans(f.db as never,f.prepare,200);
    expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(f.db.getFirstSync("SELECT state,error_json FROM creative_plan_steps WHERE kind='video'")).toEqual({state:'BLOCKED',error_json:JSON.stringify({message:'PLAN_SOURCE_CHAT_DELETED'})});
    expect(f.db.getFirstSync('SELECT state FROM creative_decision_requests')).toEqual({state:'RESOLVED'});
  }finally{f.db.close();}
});
test('outbox failure rolls back selection, draft, decision and receipt',async()=>{
  const f=await fixture();try{
    f.db.execSync("CREATE TRIGGER reject_selection BEFORE INSERT ON creative_selection_outbox BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(f.execute(f.selection,'select')).rejects.toThrow('injected');
    expect((await f.service.shots(f.projectId))[0].selected_image).toBeNull();
    expect(f.db.getAllSync('SELECT * FROM creative_generation_drafts')).toHaveLength(0);
    expect(f.db.getFirstSync('SELECT state FROM creative_decision_requests')).toEqual({state:'WAITING'});
    f.db.execSync('DROP TRIGGER reject_selection');
    await f.execute(f.selection,'select');
  }finally{f.db.close();}
});
test.each(['shot','file','cancel','restore'] as const)('%s change never resumes a stale decision',async(change)=>{
  const f=await fixture();try{
    if(change==='shot')await f.execute({name:'shot.selectOutput',payload:{id:f.shotId,expectedRevision:0,slot:'selected_image',versionId:f.versionId}});
    if(change==='file')f.db.runSync("UPDATE creative_file_resources SET state='MISSING' WHERE version_id='v2'");
    if(change==='cancel')await f.execute({name:'plan.cancel',payload:{id:f.plan.planId,expectedRevision:0}});
    if(change==='restore')quarantineRestoredExecution(f.db as never,'b'.repeat(32));
    await expect(f.execute(f.selection)).rejects.toThrow();
    expect(f.db.getAllSync('SELECT * FROM creative_selection_outbox')).toHaveLength(0);
    expect(f.db.getAllSync('SELECT * FROM creative_generation_drafts')).toHaveLength(0);
    expect(f.db.getFirstSync('SELECT selected_version_id FROM creative_decision_requests')).toEqual({selected_version_id:null});
  }finally{f.db.close();}
});
test('restore after selection quarantines READY steps including those without a job',async()=>{
  const f=await fixture();try{
    await f.execute(f.selection);
    quarantineRestoredExecution(f.db as never,'c'.repeat(32));
    expect(f.db.getFirstSync('SELECT state FROM creative_plans')).toEqual({state:'QUARANTINED'});
    expect(f.db.getFirstSync("SELECT state,job_id FROM creative_plan_steps WHERE kind='video'")).toEqual({state:'BLOCKED',job_id:null});
    expect(f.db.getFirstSync('SELECT consumed_at FROM creative_selection_outbox')).toEqual({consumed_at:null});
    expect(f.db.getFirstSync("SELECT entity_id FROM creative_restore_quarantine WHERE entity_kind='plan'")).toEqual({entity_id:f.plan.planId});
    await expect(f.execute({name:'plan.resume',payload:{id:f.plan.planId,expectedRevision:1,authorizationId:'old'}})).rejects.toThrow('PLAN_NOT_ACTIVE');
  }finally{f.db.close();}
});
