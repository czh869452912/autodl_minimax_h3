import {invalidPrerequisiteSql} from './planDependencies';
import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {submitCreativeVideo} from './videoSubmission';
import type {CreativePlanStep} from './plans';
type Submission=Parameters<typeof submitCreativeVideo>[1];
export async function runCreativePlans(db:AppDatabase,prepare:(draftId:string)=>Promise<Omit<Submission,'authorizationId'|'planStepId'>>,now=Date.now()){
  const steps=await db.getAllAsync<CreativePlanStep & {authorization_id:string|null}>(`SELECT s.*,p.authorization_id FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id JOIN creative_execution_state e ON e.epoch=p.execution_epoch
    WHERE p.state='ACTIVE' AND NOT EXISTS(SELECT 1 FROM creative_plan_controls c WHERE c.plan_id=p.id AND c.paused=1) AND s.kind='video' AND s.state='READY' AND s.job_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM creative_plan_dependencies d JOIN creative_plan_steps prerequisite ON prerequisite.id=d.depends_on_step_id WHERE d.step_id=s.id AND prerequisite.state!='SUCCEEDED')
    ORDER BY p.created_at,s.id LIMIT 5`);
  for(const step of steps){
    try{
      if(await db.getFirstAsync(invalidPrerequisiteSql,step.id))throw new Error("前置计划已失效，请核对后重新确认依赖。");
      if(!step.authorization_id||!step.draft_id)throw new Error('请授权后继续');
      const input=JSON.parse(step.input_binding_json).approvedSubmission as Omit<Submission,'authorizationId'|'planStepId'>|undefined ?? await prepare(step.draft_id);
      await submitCreativeVideo(db,{...input,authorizationId:step.authorization_id,planStepId:step.id},now);
    }catch(e){
      // A pause is a durable scheduling gate, not a failed preparation.
      if(e instanceof Error && e.message==='PLAN_PAUSED')continue;
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
    // A terminal or invalid ancestor blocks unsent descendants without replaying any work.
    await tx.runAsync(`WITH RECURSIVE failed(id) AS (
      SELECT s.id FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id JOIN creative_shots shot ON shot.id=p.shot_id
      WHERE s.state IN ('FAILED','CANCELLED') OR p.state IN ('CANCELLED','QUARANTINED') OR shot.deleted_at IS NOT NULL
      UNION SELECT d.step_id FROM creative_plan_dependencies d JOIN failed f ON f.id=d.depends_on_step_id
    ) UPDATE creative_plan_steps SET state='BLOCKED',revision=revision+1,error_json=?
      WHERE state='READY' AND job_id IS NULL AND id IN (SELECT id FROM failed)`,JSON.stringify({message:'前置计划失败、取消或失效，请检查依赖；不会自动重新生成。'}));
    // Every persisted step is required. A successful job is only one step's result.
    await tx.runAsync(`UPDATE creative_plans SET state='COMPLETED',revision=revision+1,updated_at=?
      WHERE state='ACTIVE' AND execution_epoch=(SELECT epoch FROM creative_execution_state WHERE id=1)
      AND EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=creative_plans.id)
      AND NOT EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=creative_plans.id AND s.state!='SUCCEEDED')`,now);
  });
}
