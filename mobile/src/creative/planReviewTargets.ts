import type {AppDatabase} from '../storage/appDatabase';
import type {CreativePlan,CreativePlanStep} from './plans';
export type PlanReviewTarget={plan:CreativePlan;step:CreativePlanStep;paused:boolean};
export async function readBatchReviewTargets(db:AppDatabase,projectId:string,batchId:string){
 const plans=await db.getAllAsync<CreativePlan>('SELECT p.* FROM creative_plans p JOIN creative_plan_batch_members m ON m.plan_id=p.id JOIN creative_plan_batches b ON b.id=m.batch_id AND b.project_id=p.project_id WHERE m.batch_id=? AND p.project_id=? ORDER BY m.ordinal LIMIT 21',batchId,projectId);
 if(plans.length>20)throw Error('批次超过 20 个镜头，请拆分后逐批审阅；未准备任何授权。');
 const included:PlanReviewTarget[]=[],excluded:Array<{title:string;reason:string}>=[];
 for(const plan of plans){
  const step=await db.getFirstAsync<CreativePlanStep>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'",plan.id);
  const paused=!!await db.getFirstAsync('SELECT plan_id FROM creative_plan_controls WHERE plan_id=? AND paused=1',plan.id);
  const reason=plan.state!=='ACTIVE'?'已结束':paused?'后续已暂停':step?.job_id?'已有生成任务':step?.state!=='BLOCKED'||!step.draft_id?'尚未选图或不在待授权状态':undefined;
  if(reason)excluded.push({title:plan.title,reason});else included.push({plan,step:step!,paused});
 }
 return {included,excluded};
}
