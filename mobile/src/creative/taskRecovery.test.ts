import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCreativeService } from './service';
import { createCreativeAccounts } from './accounts';
import { createCreativeBudget, dispatchCreativeBudget } from './budget';
import { submitCreativeVideo, creativeRequestHash } from './videoSubmission';
import { acknowledgeUnknownTask, unknownTaskReviewed } from './taskRecovery';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { defaultNovelAiDraft } from './novelAiProtocol';
import { H3_CREATIVE_WORKFLOW_ID } from './videoWorkflow';
import type { PreparedWorkflowSubmission } from '../workflows/runtime/runtime';

test.each(['novelai','autodl'] as const)('%s review preserves the unknown job and held cost; a new attempt needs fresh authorization',async provider=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    const service=createCreativeService(db as never),secrets=new Map<string,string>();
    const accounts=createCreativeAccounts(db as never,{now:()=>1,verify:async()=>({namespace:provider}),secrets:{get:async k=>secrets.get(k)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async k=>{secrets.delete(k);}}});
    const identity=await accounts.connect(provider,'test-secret'),budget=createCreativeBudget(db as never,()=>1);
    const image=provider==='novelai',operation=image?'image.generate':'video.generate';
    const grant=()=>budget.grant({provider,generationId:identity.generationId,operations:[operation],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:10000});
    const created=await service.execute(image?{name:'draft.createImage',payload:{input:defaultNovelAiDraft}}:{name:'draft.createVideo',payload:{prompt:'scene'}},'draft');
    if(created.status!=='completed')throw new Error('draft');
    const draft=(await service.draft(created.value.draftId))!;
    const prepared:PreparedWorkflowSubmission={workflowId:image?draft.workflow_id:H3_CREATIVE_WORKFLOW_ID,workflowVersion:'1',workflowContentHash:'hash',adapterId:image?'novelai-image':'autodl-comfyui',adapterVersion:'1',inputSnapshot:{prompt:'scene'},requestInput:{prompt:'scene'},target:{operation}};
    const authorizationId=await grant();
    const submit=(row:typeof draft,auth:string)=>submitCreativeVideo(db as never,{draftId:row.id,expectedRevision:row.revision,draftInputJson:row.input_json,authorizationId:auth,prepared,images:[],versionIds:[]},2);
    const original=await submit(draft,authorizationId);
    await expect(acknowledgeUnknownTask(db as never,original.id,3)).rejects.toThrow('状态已变化');
    const reservation=db.getFirstSync<{id:string}>('SELECT id FROM creative_budget_reservations')!;
    await withWriteTransaction(db as never,tx=>dispatchCreativeBudget(tx,reservation.id,{accountId:identity.accountId,generationId:identity.generationId,requestHash:creativeRequestHash(prepared)},3));
    await budget.transition(reservation.id,{key:'unknown',to:'UNKNOWN_HELD',evidence:'提交响应未确认'});
    db.runSync("UPDATE workflow_jobs SET status='UNKNOWN' WHERE id=?",original.id);
    db.runSync("UPDATE workflow_operations SET state='BLOCKED' WHERE job_id=?",original.id);
    await acknowledgeUnknownTask(db as never,original.id,4);
    await acknowledgeUnknownTask(db as never,original.id,5);
    expect(await unknownTaskReviewed(db as never,original.id)).toBe(true);
    expect(db.getFirstSync('SELECT COUNT(*) AS n FROM workflow_operations')).toEqual({n:1});
    expect(db.getFirstSync('SELECT state FROM creative_budget_reservations')).toEqual({state:'UNKNOWN_HELD'});
    expect(db.getFirstSync('SELECT status FROM workflow_jobs')).toEqual({status:'UNKNOWN'});
    const copied=await service.execute({name:'draft.copySubmitted',payload:{id:draft.id}},'next');
    if(copied.status!=='completed')throw new Error('copy');
    const successor=(await service.draft(copied.value.draftId))!;
    await expect(submit(successor,authorizationId)).rejects.toThrow('REQUEST_BUDGET_EXCEEDED');
    expect(db.getFirstSync('SELECT COUNT(*) AS n FROM workflow_jobs')).toEqual({n:1});
    const next=await submit(successor,await grant());
    expect(next.id).not.toBe(original.id);
    expect(db.getFirstSync('SELECT status FROM workflow_jobs WHERE id=?',original.id)).toEqual({status:'UNKNOWN'});
    expect(db.getFirstSync('SELECT state FROM creative_budget_reservations WHERE id=?',reservation.id)).toEqual({state:'UNKNOWN_HELD'});
  }finally{db.close();}
});
