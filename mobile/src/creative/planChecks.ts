import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {inspectShotQuality} from './shotQuality';
import {shotDependencySignature} from './shotDependencies';
/** Deterministic, local structural nodes. No models, adoption, or spending. */
export async function runLocalPlanChecks(db:AppDatabase){
 return withWriteTransaction(db,async tx=>{
  const rows=await tx.getAllAsync<{id:string;project_id:string;shot_id:string}>(`SELECT s.id,p.project_id,p.shot_id FROM creative_plan_steps s JOIN creative_plans p ON p.id=s.plan_id JOIN creative_execution_state e ON e.epoch=p.execution_epoch
   JOIN creative_projects project ON project.id=p.project_id AND project.archived_at IS NULL
   WHERE s.kind='local_check' AND s.state='PENDING' AND p.state='ACTIVE' AND NOT EXISTS(SELECT 1 FROM creative_plan_controls c WHERE c.plan_id=p.id AND c.paused=1)
   AND NOT EXISTS(SELECT 1 FROM creative_plan_dependencies d JOIN creative_plan_steps parent ON parent.id=d.depends_on_step_id WHERE d.step_id=s.id AND parent.state!='SUCCEEDED') ORDER BY p.created_at,s.id LIMIT 20`);
  for(const row of rows){
   try{
    const report=await inspectShotQuality(tx,row.project_id,row.shot_id),signature=await shotDependencySignature(tx,row.shot_id,row.project_id);
    const errors=report.findings.filter(f=>f.severity==='error');
    await tx.runAsync("UPDATE creative_plan_steps SET state=?,revision=revision+1,result_binding_json=?,error_json=? WHERE id=? AND state='PENDING'",errors.length?'BLOCKED':'SUCCEEDED',JSON.stringify({kind:'structural-check',dependencySignature:signature,report}),errors.length?JSON.stringify({message:'本地检查发现不可用依赖，请修复后重新准备。'}):null,row.id);
   }catch(e){await tx.runAsync("UPDATE creative_plan_steps SET state='BLOCKED',revision=revision+1,error_json=? WHERE id=? AND state='PENDING'",JSON.stringify({message:e instanceof Error?e.message:'LOCAL_CHECK_FAILED'}),row.id);}
  }
  await tx.runAsync(`UPDATE creative_plan_steps SET state='BLOCKED',revision=revision+1,error_json=? WHERE kind='video' AND state='READY' AND job_id IS NULL AND EXISTS(SELECT 1 FROM creative_plan_dependencies d JOIN creative_plan_steps c ON c.id=d.depends_on_step_id WHERE d.step_id=creative_plan_steps.id AND c.kind='local_check' AND c.state='BLOCKED')`,JSON.stringify({message:'本地依赖检查未通过，请修复素材后按当前镜头重新准备。'}));
  return rows.length;
 });
}
