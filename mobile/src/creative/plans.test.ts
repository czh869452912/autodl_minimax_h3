import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {quarantineRestoredExecution} from '../storage/restoreIsolation';
import type {CreativeCommand} from './types';
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
