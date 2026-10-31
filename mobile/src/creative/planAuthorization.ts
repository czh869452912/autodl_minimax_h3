import type {AppDatabase} from '../storage/appDatabase';
import {grantCreativeBudget} from './budget';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {applyPlanCommand} from './plans';
import {creativeRequestHash} from './videoSubmission';
import type {PreparedCreativeSubmission} from './preparedSubmission';
import {createId} from '../ids';

/** User confirmation only. Preparation and any network I/O must finish before this transaction. */
export type PlanApproval={planId:string;planRevision:number;stepId:string;stepRevision:number;projectId:string;generationId:string;submission:PreparedCreativeSubmission};
export async function authorizePlanRequest(db:AppDatabase,input:PlanApproval,now=Date.now()){
 return withWriteTransaction(db,tx=>approvePlan(tx,input,now));
}
export async function authorizePlanBatch(db:AppDatabase,batchId:string,projectId:string,inputs:PlanApproval[],now=Date.now()){
 if(!inputs.length||inputs.length>20||new Set(inputs.map(i=>i.planId)).size!==inputs.length)throw new Error('BATCH_APPROVAL_RANGE_INVALID');
 return withWriteTransaction(db,async tx=>{
  const ids:string[]=[];
  for(const input of inputs){
   if(input.projectId!==projectId||!await tx.getFirstAsync('SELECT m.plan_id FROM creative_plan_batch_members m JOIN creative_plan_batches b ON b.id=m.batch_id WHERE b.id=? AND b.project_id=? AND m.plan_id=?',batchId,projectId,input.planId))throw new Error('BATCH_APPROVAL_SCOPE_MISMATCH');
   ids.push(await approvePlan(tx,input,now));
  }
  return ids;
 });
}
async function approvePlan(db:AppDatabase,input:PlanApproval,now:number){
 const submission=input.submission;
 const requestBinding={commandId:`creative-video:${submission.draftId}:${submission.expectedRevision}`,requestHash:creativeRequestHash(submission.prepared)};
 return grantCreativeBudget(db,{provider:'autodl',generationId:input.generationId,projectId:input.projectId,operations:['video.generate'],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:now+15*60000,requestBinding},()=>now,async(tx,authorizationId)=>{
  const step=await tx.getFirstAsync<{input_binding_json:string}>(`SELECT s.input_binding_json FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id
   JOIN creative_generation_drafts d ON d.id=s.draft_id WHERE s.id=? AND s.plan_id=? AND p.project_id=? AND s.revision=? AND s.state='BLOCKED' AND s.job_id IS NULL
   AND d.id=? AND d.project_id=p.project_id AND d.state='EDITING' AND d.revision=? AND d.input_json=?`,input.stepId,input.planId,input.projectId,input.stepRevision,submission.draftId,submission.expectedRevision,submission.draftInputJson);
  if(!step)throw new Error('PLAN_CONFIRMATION_CHANGED');
  await applyPlanCommand(tx,'plan.resume',{id:input.planId,expectedRevision:input.planRevision,authorizationId},now,createId,createId());
  await tx.runAsync('UPDATE creative_plan_steps SET input_binding_json=? WHERE id=?',JSON.stringify({...JSON.parse(step.input_binding_json),approvedSubmission:submission}),input.stepId);
 });
}
