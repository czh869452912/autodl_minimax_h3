import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import type {CreativeCommand} from './types';
import {readSemanticDetail} from './semanticReads';
import {createCreativeAccounts} from './accounts';
import {authorizePlanBatch} from './planAuthorization';
import {runCreativePlans,reconcileCreativePlans} from './planRunner';
import {H3_CREATIVE_WORKFLOW_ID} from './videoWorkflow';
import {readDraftSemantics} from './draftSemantics';

test('two-shot production preserves reviewed semantics, isolated grants, reordering and failed-attempt history',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  let service=createCreativeService(db as never),key=0;
  const execute=async(command:CreativeCommand)=>{const r=await service.execute(command,'acceptance-'+key++);if(r.status!=='completed')throw new Error('expected');return r.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'repair acceptance'}});
  const shots=[];for(let i=0;i<2;i++)shots.push((await execute({name:'shot.create',payload:{projectId,title:'shot '+i,description:'orbit'}})).shotId);
  const sha256='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',sha256,'image/png','cas/'+sha256);
  const {assetId,versionId}=await execute({name:'asset.import',payload:{projectId,title:'reference',kind:'image',blobSha256:sha256}});
  const first=await execute({name:'semantic.create',payload:{projectId,kind:'character',title:'Lead',content:'Blue coat',references:[{versionId,purpose:'appearance'}]}});
  await execute({name:'semantic.adopt',payload:{entityId:first.entityId,expectedRevision:0,versionId:first.versionId}});
  for(const shotId of shots)await execute({name:'semantic.bindShot',payload:{entityId:first.entityId,versionId:first.versionId,shotId,expectedShotRevision:0}});
  const second=await execute({name:'semantic.revise',payload:{entityId:first.entityId,expectedRevision:1,content:'Red coat',references:[{versionId,purpose:'appearance'}]}});
  const review=await readSemanticDetail(db as never,projectId,first.entityId);
  expect(review.adopted?.id).toBe(first.versionId);expect(review.page.items[0].references[0].asset_version_id).toBe(versionId);
  await execute({name:'semantic.adopt',payload:{entityId:first.entityId,expectedRevision:2,versionId:second.versionId}});
  await execute({name:'semantic.unbindShot',payload:{entityId:first.entityId,shotId:shots[1],expectedShotRevision:1}});
  await execute({name:'semantic.bindShot',payload:{entityId:first.entityId,versionId:second.versionId,shotId:shots[1],expectedShotRevision:2}});
  await expect(execute({name:'asset.unlinkFromProject',payload:{assetId,projectId,expectedRevision:0}})).rejects.toThrow('Lead');
  const batch=await execute({name:'plan.createBatch',payload:{projectId,title:'two shots',shots:shots.map((shotId,i)=>({shotId,expectedShotRevision:i?3:1,title:'production '+i,candidateVersionIds:[versionId],videoPrompt:'orbit'}))}});
  const members=db.getAllSync<{plan_id:string}>('SELECT plan_id FROM creative_plan_batch_members WHERE batch_id=? ORDER BY ordinal',batch.batchId);
  for(const member of members){const decision=db.getFirstSync<{id:string}>('SELECT id FROM creative_decision_requests WHERE plan_id=?',member.plan_id)!;await execute({name:'plan.resolveSelection',payload:{decisionId:decision.id,expectedRevision:0,versionId}});}
  const secrets=new Map<string,string>();const accounts=createCreativeAccounts(db as never,{now:()=>100,verify:async()=>({namespace:'autodl',authenticated:false}),secrets:{get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}}});
  const identity=await accounts.connect('autodl','offline-test-only');
  await runCreativePlans(db as never,async()=>{throw new Error('no authorization yet');},100);
  const prepared=[];
  for(const member of members){
   const step=db.getFirstSync<{id:string;revision:number;draft_id:string}>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'",member.plan_id)!;
   const draft=(await service.draft(step.draft_id))!;
   const submission={draftId:draft.id,expectedRevision:draft.revision,draftInputJson:draft.input_json,prepared:{workflowId:H3_CREATIVE_WORKFLOW_ID,workflowVersion:'1',workflowContentHash:'hash',adapterId:'autodl',adapterVersion:'1',inputSnapshot:{prompt:'orbit',seed:17},requestInput:{prompt:'orbit',seed:17},target:{operation:'generate'}},images:[{uri:'asset://'+sha256,sha256,mime:'image/png',size:10,name:versionId}],versionIds:[versionId]};
   prepared.push({step,submission,approval:{planId:member.plan_id,planRevision:0,stepId:step.id,stepRevision:step.revision,projectId,generationId:identity.generationId,submission},authorizationId:''});
  }
  const approvals=prepared.map(p=>p.approval);
  const batchId=db.getFirstSync<{id:string}>('SELECT id FROM creative_plan_batches')!.id;
  await expect(authorizePlanBatch(db as never,batchId,projectId,[approvals[0],{...approvals[1],stepRevision:999}],200)).rejects.toThrow('PLAN_CONFIRMATION_CHANGED');
  expect(db.getAllSync('SELECT * FROM creative_authorizations')).toHaveLength(0);
  await expect(authorizePlanBatch(db as never,batchId,'other',approvals,200)).rejects.toThrow('SCOPE_MISMATCH');
  const grants=await authorizePlanBatch(db as never,batchId,projectId,approvals,200);
  prepared.forEach((p,i)=>p.authorizationId=grants[i]);
  const snapshot=await readDraftSemantics(db as never,prepared[0].step.draft_id);
  await execute({name:'shot.reorder',payload:{projectId,shots:[{id:shots[1],expectedRevision:4},{id:shots[0],expectedRevision:2}]}});
  // A real dependency changes only on the second shot after confirmation.
  await execute({name:'semantic.bindShot',payload:{entityId:first.entityId,versionId:first.versionId,shotId:shots[1],expectedShotRevision:5}});
  service=createCreativeService(db as never); // Recreate services: no in-memory prepared request is needed.
  const prepare=jest.fn(async()=>{throw new Error('must read durable approval');});
  await runCreativePlans(db as never,prepare,300);
  expect(prepare).not.toHaveBeenCalled();expect(db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
  expect(db.getFirstSync('SELECT authorization_id FROM creative_budget_reservations')).toEqual({authorization_id:prepared[0].authorizationId});
  const refreshed=await execute({name:'plan.reprepare',payload:{id:members[1].plan_id,expectedRevision:1,expectedShotRevision:6,prompt:'reviewed orbit'}});
  expect(refreshed.previousDraftId).toBe(prepared[1].step.draft_id);
  expect(db.getFirstSync<{revoked_at:number}>('SELECT revoked_at FROM creative_authorizations WHERE id=?',prepared[1].authorizationId)?.revoked_at).toBeTruthy();
  db.runSync("UPDATE workflow_jobs SET status='FAILED'");await reconcileCreativePlans(db as never,400);
  await execute({name:'plan.retryFailed',payload:{id:members[0].plan_id,expectedRevision:1,expectedShotRevision:3}});
  expect(db.getAllSync('SELECT * FROM creative_plan_attempts')).toHaveLength(1);
  expect(db.getAllSync('SELECT * FROM creative_budget_reservations')).toHaveLength(1);
  expect(await readDraftSemantics(db as never,prepared[0].step.draft_id)).toEqual(snapshot);
  await runCreativePlans(db as never,prepare,500);expect(db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(1);
  expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
 }finally{db.close();}
});
