/** Review probes: assertions describe observed current behavior, not desired behavior. No network calls. */
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {createCreativeAccounts} from './accounts';
import {createCreativeBudget,readCreativeAuthorizationSummaries} from './budget';
import {readUsageGraph} from './usageGraph';
import {readShotSemantics} from './semanticResources';
import {runCreativePlans} from './planRunner';
import {checkPlanSubmission} from './planDispatch';
import type {CreativeCommand} from './types';

async function fixture(){
 const db=createInitializedRealSqliteTestDb();let next=0;
 const service=createCreativeService(db as never,{id:()=>`review-${++next}`,now:()=>100});
 const execute=async(command:CreativeCommand)=>{const result=await service.execute(command,`command-${++next}`);if(result.status!=='completed')throw new Error('unexpected');return result.value;};
 const {projectId}=await execute({name:'project.create',payload:{title:'Review project'}});
 const {shotId}=await execute({name:'shot.create',payload:{projectId,title:'Shot',description:'Move camera'}});
 const image=async(char:string)=>{
  const hash=char.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png',`cas/${hash}`);
  return execute({name:'asset.import',payload:{title:'reference '+char,kind:'image',blobSha256:hash,projectId}});
 };
 return {db,service,execute,projectId,shotId,image};
}

test('OBSERVED: one-plan grant is listed as a general project allowance and can reserve an unrelated request',async()=>{
 const f=await fixture();try{
  const {versionId}=await f.image('a');
  const plan=await f.execute({name:'plan.createSelection',payload:{projectId:f.projectId,shotId:f.shotId,expectedShotRevision:0,title:'Only this plan',candidateVersionIds:[versionId],videoPrompt:'Original approved prompt'}});
  await f.execute({name:'plan.resolveSelection',payload:{decisionId:plan.decisionId,versionId,expectedRevision:0}});
  await runCreativePlans(f.db as never,jest.fn(),200); // no allowance: enters BLOCKED, no preparation
  const secrets=new Map<string,string>();
  const accounts=createCreativeAccounts(f.db as never,{now:()=>100,verify:async()=>({namespace:'autodl',authenticated:false}),secrets:{get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}}});
  const identity=await accounts.connect('autodl','offline-secret');
  const budget=createCreativeBudget(f.db as never,()=>100);
  // Same grant fields as ProjectPlans.authorize: no request/plan binding.
  const authorizationId=await budget.grant({provider:'autodl',generationId:identity.generationId,projectId:f.projectId,operations:['video.generate'],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:10000});
  await f.execute({name:'plan.resume',payload:{id:plan.planId,expectedRevision:0,authorizationId}});
  expect((await readCreativeAuthorizationSummaries(f.db as never,f.projectId,100)).items.map(a=>a.id)).toContain(authorizationId);
  const requestHash='f'.repeat(64);
  const reservation=await budget.reserve({authorizationId,projectId:f.projectId,provider:'autodl',operation:'video.generate',requestUnits:1,commandId:'unrelated-draft-command',requestHash,estimate:{maximum:null,unit:'autodl_points',requestHash,validUntil:5000}});
  expect(reservation.command_id).toBe('unrelated-draft-command');
  expect((await readCreativeAuthorizationSummaries(f.db as never,f.projectId,100)).items[0].remainingRequests).toBe(0);
 }finally{f.db.close();}
});

test('OBSERVED: adopted semantic references disappear from usage and can be unlinked then trashed',async()=>{
 const f=await fixture();try{
  const {assetId,versionId}=await f.image('b');
  const semantic=await f.execute({name:'semantic.create',payload:{projectId:f.projectId,kind:'character',title:'Lead',content:'Reference defines coat',references:[{versionId,purpose:'coat'}]}});
  await f.execute({name:'semantic.adopt',payload:{entityId:semantic.entityId,versionId:semantic.versionId,expectedRevision:0}});
  await f.execute({name:'semantic.bindShot',payload:{entityId:semantic.entityId,versionId:semantic.versionId,shotId:f.shotId,expectedShotRevision:0}});
  await f.execute({name:'asset.unlinkFromProject',payload:{projectId:f.projectId,assetId,expectedRevision:0}});
  expect(await readUsageGraph(f.db as never,assetId)).toEqual([]);
  const asset=(await f.service.assets()).find(a=>a.id===assetId)!;
  await f.execute({name:'asset.trash',payload:{id:assetId,expectedRevision:asset.revision}});
  expect(f.db.getAllSync('SELECT * FROM creative_asset_trash')).toHaveLength(1);
  expect(f.db.getAllSync('SELECT * FROM creative_semantic_references')).toHaveLength(1);
  expect(await readShotSemantics(f.db as never,f.shotId,f.projectId)).toEqual([expect.objectContaining({version_id:semantic.versionId,stale:0})]);
 }finally{f.db.close();}
});

test('OBSERVED: there is no semantic unbind command after filling all eight shot slots',async()=>{
 const f=await fixture();try{
  for(let i=0;i<8;i++){
   const semantic=await f.execute({name:'semantic.create',payload:{projectId:f.projectId,kind:'character',title:'Character '+i,content:'description'}});
   await f.execute({name:'semantic.adopt',payload:{entityId:semantic.entityId,versionId:semantic.versionId,expectedRevision:0}});
   await f.execute({name:'semantic.bindShot',payload:{entityId:semantic.entityId,versionId:semantic.versionId,shotId:f.shotId,expectedShotRevision:i}});
  }
  const ninth=await f.execute({name:'semantic.create',payload:{projectId:f.projectId,kind:'scene',title:'Actual scene',content:'scene'}});
  await expect(f.execute({name:'semantic.bindShot',payload:{entityId:ninth.entityId,versionId:ninth.versionId,shotId:f.shotId,expectedShotRevision:8}})).rejects.toThrow('SHOT_SEMANTIC_LIMIT');
  await expect(f.execute({name:'semantic.unbindShot',payload:{shotId:f.shotId,entityId:ninth.entityId,expectedShotRevision:8}} as never)).rejects.toThrow('UNKNOWN_CREATIVE_COMMAND');
 }finally{f.db.close();}
});

test('OBSERVED: reorder without changing media or prompt invalidates an already selected plan',async()=>{
 const f=await fixture();try{
  const {versionId}=await f.image('c');
  const plan=await f.execute({name:'plan.createSelection',payload:{projectId:f.projectId,shotId:f.shotId,expectedShotRevision:0,title:'Plan',candidateVersionIds:[versionId],videoPrompt:'Unchanged prompt'}});
  const resolved=await f.execute({name:'plan.resolveSelection',payload:{decisionId:plan.decisionId,versionId,expectedRevision:0}});
  const {shotId:other}=await f.execute({name:'shot.create',payload:{projectId:f.projectId,title:'Other shot'}});
  await f.execute({name:'shot.reorder',payload:{projectId:f.projectId,shots:[{id:other,expectedRevision:0},{id:f.shotId,expectedRevision:1}]}});
  const secrets=new Map<string,string>();
  const accounts=createCreativeAccounts(f.db as never,{now:()=>100,verify:async()=>({namespace:'autodl',authenticated:false}),secrets:{get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}}});
  const identity=await accounts.connect('autodl','offline-secret');
  const authorizationId=await createCreativeBudget(f.db as never,()=>100).grant({provider:'autodl',generationId:identity.generationId,projectId:f.projectId,operations:['video.generate'],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:10000});
  // Install a real grant solely to reach the downstream revision guard, without submitting a job.
  f.db.runSync('UPDATE creative_plans SET authorization_id=? WHERE id=?',authorizationId,plan.planId);
  const step=f.db.getFirstSync<{id:string}>('SELECT id FROM creative_plan_steps WHERE draft_id=?',resolved.draftId)!;
  await expect(checkPlanSubmission(f.db as never,resolved.draftId,step.id,authorizationId,'not-created',true)).rejects.toThrow('镜头已变更');
 }finally{f.db.close();}
});
