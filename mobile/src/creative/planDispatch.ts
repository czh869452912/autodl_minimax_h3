import type {AppDatabase} from '../storage/appDatabase';
import type {CreativePlan,CreativePlanStep} from './plans';
export async function checkPlanSubmission(tx:AppDatabase,draftId:string,stepId:string|undefined,authorizationId:string,jobId:string,inserted:boolean){
  const step=await tx.getFirstAsync<CreativePlanStep>('SELECT * FROM creative_plan_steps WHERE draft_id=?',draftId);
  if(!step){if(stepId)throw new Error('PLAN_STEP_NOT_FOUND');return;}
  if(step.id!==stepId)throw new Error('PLAN_DRAFT_REQUIRES_PLAN_SUBMISSION');
  const plan=await tx.getFirstAsync<CreativePlan>('SELECT * FROM creative_plans WHERE id=?',step.plan_id);
  const epoch=await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1');
  if(!plan||plan.state!=='ACTIVE'||plan.execution_epoch!==epoch?.epoch||plan.authorization_id!==authorizationId)throw new Error('PLAN_NOT_DISPATCHABLE');
  if(!inserted){if(step.job_id!==jobId)throw new Error('PLAN_JOB_CONFLICT');return;}
  if(step.state!=='READY'||step.job_id||!await tx.getFirstAsync('SELECT event_id FROM creative_selection_outbox WHERE step_id=? AND execution_epoch=? AND consumed_at IS NULL',step.id,epoch.epoch))throw new Error('PLAN_STEP_NOT_READY');
  if(await tx.getFirstAsync("SELECT d.step_id FROM creative_plan_dependencies d JOIN creative_plan_steps s ON s.id=d.depends_on_step_id WHERE d.step_id=? AND s.state!='SUCCEEDED'",step.id))throw new Error('PLAN_DEPENDENCY_NOT_COMPLETE');
  const input=JSON.parse(step.input_binding_json);
  if(!await tx.getFirstAsync('SELECT version_id FROM creative_draft_inputs WHERE draft_id=? AND ordinal=0 AND version_id=?',draftId,input.versionId))throw new Error('PLAN_INPUT_CHANGED');
  // A deleted originating chat closes unsent automation, but never removes audit.
  const source=await tx.getFirstAsync<{thread_id:string}>(`SELECT o.thread_id FROM creative_command_receipts r JOIN creative_execution_origins o ON o.id=r.execution_origin_id
    WHERE r.command_name='plan.createSelection' AND json_extract(r.result_json,'$.value.planId')=? AND o.origin_kind='agent'`,plan.id);
  if(source&&!await tx.getFirstAsync('SELECT thread_id FROM agent_thread_index WHERE thread_id=? AND deleted=0',source.thread_id))throw new Error('PLAN_SOURCE_CHAT_DELETED');
}
export async function recordPlanSubmission(tx:AppDatabase,stepId:string,jobId:string,now:number){
  const r=await tx.runAsync("UPDATE creative_plan_steps SET state='DISPATCHED',revision=revision+1,job_id=?,error_json=NULL WHERE id=? AND state='READY' AND job_id IS NULL",jobId,stepId);
  if(Number(r.changes)!==1)throw new Error('PLAN_STEP_NOT_READY');
  await tx.runAsync('UPDATE creative_selection_outbox SET consumed_at=? WHERE step_id=? AND consumed_at IS NULL',now,stepId);
}
