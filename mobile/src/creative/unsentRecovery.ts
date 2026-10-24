import type {AppDatabase} from '../storage/appDatabase';
import {createJobStateRepository} from '../tasks/jobStateStore';
import {createCreativeBudget} from './budget';

/** RESERVED is proof that the bound adapter never crossed its dispatch boundary. */
export async function recoverUnsentCreativeJobs(db:AppDatabase,now=Date.now()){
  const rows=await db.getAllAsync<{id:string;job_id:string}>(`SELECT r.id,r.job_id FROM creative_budget_reservations r
    JOIN creative_execution_state e ON e.epoch=r.execution_epoch JOIN workflow_jobs j ON j.id=r.job_id
    WHERE r.state='RESERVED' AND j.provider_handle_json IS NULL
    AND (j.status IN ('UNKNOWN','FAILED','CANCELLED') OR (j.status='READY_TO_SUBMIT' AND EXISTS(
      SELECT 1 FROM workflow_operations o WHERE o.job_id=j.id AND o.kind='SUBMIT' AND o.state='BLOCKED'
      AND json_extract(o.last_error_json,'$.code')='CREATIVE_CREDENTIAL_UNAVAILABLE')))
    AND NOT EXISTS(SELECT 1 FROM creative_restore_quarantine q WHERE q.entity_id=j.id)`);
  const jobs=createJobStateRepository(db),budget=createCreativeBudget(db,()=>now);
  for(const row of rows){
    const job=await jobs.get(row.job_id);if(!job)continue;
    if(!['FAILED','CANCELLED'].includes(job.status)){
      const result=await jobs.transition({jobId:job.id,expectedRevision:job.revision,patch:{status:'FAILED',lastError:{code:'CREATIVE_NOT_DISPATCHED',message:'本地准备未完成，请检查账号和参考素材后重新生成。',retryable:false},updatedAt:now},event:{id:`${job.id}:unsent-recovered`,type:'SUBMIT_FAILED',payload:{reason:'not-dispatched'},createdAt:now}});
      if(!result.ok)continue;
      await db.runAsync("UPDATE workflow_operations SET state='FAILED',updated_at=? WHERE job_id=? AND kind='SUBMIT' AND state='BLOCKED'",now,job.id);
    }
    await budget.transition(row.id,{key:`unsent-release:${row.id}`,to:'RELEASED',evidence:'未跨越发送边界，本地请求已结束。'});
  }
}
