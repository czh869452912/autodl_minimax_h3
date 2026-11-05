import type {CreativeDecision,CreativePlan,CreativePlanStep} from './plans';

/** Terminal plan states take precedence over retained step/job history. */
export function planPresentation({plan,step,decision,paused}:{plan:Pick<CreativePlan,'state'>;step:Pick<CreativePlanStep,'state'|'job_id'>;decision:Pick<CreativeDecision,'state'>;paused:boolean}){
 if(plan.state==='CANCELLED')return {status:'计划已取消',action:'查看取消记录'};
 if(plan.state==='QUARANTINED')return {status:'计划已隔离，需核对旧任务',action:'查看隔离与原任务'};
 if(plan.state==='COMPLETED')return {status:'候选已归档',action:'查看执行与候选'};
 if(paused)return {status:'后续已暂停',action:'查看暂停与恢复'};
 if(step.state==='FAILED')return {status:'任务未完成',action:'处理失败镜头'};
 if(step.job_id)return {status:'已有生成任务',action:'查看执行与候选'};
 if(decision.state==='WAITING')return {status:'等待选择参考图',action:'选择参考图'};
 return {status:'等待核对输入与许可',action:'核对计划请求'};
}
