import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {submitCreativeVideo} from './videoSubmission';
import type {CreativePlanStep} from './plans';
type Submission=Parameters<typeof submitCreativeVideo>[1];
export async function runCreativePlans(db:AppDatabase,prepare:(draftId:string)=>Promise<Omit<Submission,'authorizationId'|'planStepId'>>,now=Date.now()){
  const steps=await db.getAllAsync<CreativePlanStep & {authorization_id:string|null}>(`SELECT s.*,p.authorization_id FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id JOIN creative_execution_state e ON e.epoch=p.execution_epoch
    WHERE p.state='ACTIVE' AND s.kind='video' AND s.state='READY' AND s.job_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM creative_plan_dependencies d JOIN creative_plan_steps prerequisite ON prerequisite.id=d.depends_on_step_id WHERE d.step_id=s.id AND prerequisite.state!='SUCCEEDED')
    ORDER BY p.created_at,s.id LIMIT 5`);
  for(const step of steps){
    try{
      if(!step.authorization_id||!step.draft_id)throw new Error('请授权后继续');
      const input=await prepare(step.draft_id);
      await submitCreativeVideo(db,{...input,authorizationId:step.authorization_id,planStepId:step.id},now);
    }catch(e){
      // The other worker may already have committed. Never overwrite its state.
      await withWriteTransaction(db,tx=>tx.runAsync("UPDATE creative_plan_steps SET state='BLOCKED',revision=revision+1,error_json=? WHERE id=? AND state='READY' AND job_id IS NULL",JSON.stringify({message:e instanceof Error?e.message.slice(0,300):'PLAN_PREPARATION_FAILED'}),step.id).then(()=>undefined));
    }
  }
  await reconcileCreativePlans(db,now);
  return {scanned:steps.length};
}
export async function reconcileCreativePlans(db:AppDatabase,now=Date.now()){
  await withWriteTransaction(db,async tx=>{
    const pending=await tx.getAllAsync<CreativePlanStep & {job_status:string}>(`SELECT s.*,j.status AS job_status FROM creative_plan_steps s JOIN workflow_jobs j ON j.id=s.job_id JOIN creative_plans p ON p.id=s.plan_id JOIN creative_execution_state e ON e.epoch=p.execution_epoch WHERE p.state='ACTIVE' AND s.kind='video' AND s.state='DISPATCHED' LIMIT 20`);
    for(const step of pending){
      const outputs=await tx.getAllAsync<{version_id:string}>('SELECT version_id FROM creative_output_links WHERE job_id=?',step.job_id);
      if(['SUCCEEDED','PARTIAL_SUCCEEDED'].includes(step.job_status)&&outputs.length){
        await tx.runAsync("UPDATE creative_plan_steps SET state='SUCCEEDED',revision=revision+1,result_binding_json=? WHERE id=?",JSON.stringify({jobId:step.job_id,versionIds:outputs.map(v=>v.version_id)}),step.id);
      }else if(['FAILED','CANCELLED'].includes(step.job_status))await tx.runAsync("UPDATE creative_plan_steps SET state='FAILED',revision=revision+1,error_json=? WHERE id=?",JSON.stringify({message:'生成未完成，请检查原任务。计划不会自动重新消费。'}),step.id);
    }
    // Every persisted step is required. A successful job is only one step's result.
    await tx.runAsync(`UPDATE creative_plans SET state='COMPLETED',revision=revision+1,updated_at=?
      WHERE state='ACTIVE' AND execution_epoch=(SELECT epoch FROM creative_execution_state WHERE id=1)
      AND EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=creative_plans.id)
      AND NOT EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=creative_plans.id AND s.state!='SUCCEEDED')`,now);
  });
}
