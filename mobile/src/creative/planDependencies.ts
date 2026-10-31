import type {AppDatabase} from '../storage/appDatabase';
import type {CreativePlan,CreativePlanStep} from './plans';
// Completion dependencies order work; they never implicitly adopt an upstream output.
export async function changePlanDependency(tx:AppDatabase,plan:CreativePlan,upstreamId:string,enabled:boolean,now:number){
 const upstream=await tx.getFirstAsync<CreativePlan>('SELECT * FROM creative_plans WHERE id=?',upstreamId);
 if(!upstream||upstream.id===plan.id||upstream.project_id!==plan.project_id||(enabled&&(upstream.execution_epoch!==plan.execution_epoch||!['ACTIVE','COMPLETED'].includes(upstream.state))))throw new Error('DEPENDENCY_SCOPE_INVALID');
 const step=await tx.getFirstAsync<CreativePlanStep>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'",plan.id);
 const parent=await tx.getFirstAsync<CreativePlanStep>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'",upstreamId);
 if(!step||!parent||step.job_id||!['PENDING','READY','BLOCKED'].includes(step.state))throw new Error('DEPENDENCY_ALREADY_EXECUTED');
 if(enabled){
  if(await tx.getFirstAsync(`WITH RECURSIVE ancestors(id) AS (SELECT ? UNION SELECT d.depends_on_step_id FROM creative_plan_dependencies d JOIN ancestors a ON d.step_id=a.id) SELECT id FROM ancestors WHERE id=?`,parent.id,step.id))throw new Error('DEPENDENCY_CYCLE');
  const count=await tx.getFirstAsync<{n:number}>('SELECT COUNT(*) AS n FROM creative_plan_dependencies WHERE step_id=?',step.id);
  if(count!.n>=21)throw new Error('DEPENDENCY_LIMIT');
  await tx.runAsync('INSERT OR IGNORE INTO creative_plan_dependencies VALUES(?,?)',step.id,parent.id);
 }else await tx.runAsync('DELETE FROM creative_plan_dependencies WHERE step_id=? AND depends_on_step_id=?',step.id,parent.id);
 const binding=JSON.parse(step.input_binding_json);delete binding.approvedSubmission;
 if(plan.authorization_id)await tx.runAsync('UPDATE creative_authorizations SET revoked_at=COALESCE(revoked_at,?),revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM creative_authorization_requests r WHERE r.authorization_id=creative_authorizations.id)',now,plan.authorization_id);
 await tx.runAsync("UPDATE creative_plan_steps SET input_binding_json=?,state=CASE WHEN state='READY' THEN 'BLOCKED' ELSE state END,revision=revision+1,error_json=? WHERE id=?",JSON.stringify(binding),JSON.stringify({message:'前置计划已修改，选图后请重新确认请求。'}),step.id);
 await tx.runAsync('UPDATE creative_plans SET authorization_id=NULL,revision=revision+1,updated_at=? WHERE id=?',now,plan.id);
 await tx.runAsync("UPDATE creative_decision_requests SET plan_revision=plan_revision+1 WHERE plan_id=? AND state='WAITING'",plan.id);
 return {planId:plan.id,upstreamPlanId:upstreamId};
}
export const invalidPrerequisiteSql=`SELECT d.step_id FROM creative_plan_dependencies d
 JOIN creative_plan_steps s ON s.id=d.depends_on_step_id JOIN creative_plans p ON p.id=s.plan_id
 JOIN creative_shots shot ON shot.id=p.shot_id JOIN creative_execution_state e ON e.id=1
 WHERE d.step_id=? AND (s.state!='SUCCEEDED' OR p.state NOT IN ('ACTIVE','COMPLETED') OR p.execution_epoch!=e.epoch OR shot.deleted_at IS NOT NULL)`;
export async function readPlanDependencies(db:AppDatabase,stepId:string){
 return db.getAllAsync<{id:string;title:string;state:string;plan_state:string}>(`SELECT p.id,p.title,s.state,p.state AS plan_state FROM creative_plan_dependencies d JOIN creative_plan_steps s ON s.id=d.depends_on_step_id AND s.kind='video' JOIN creative_plans p ON p.id=s.plan_id WHERE d.step_id=? ORDER BY p.id`,stepId);
}
