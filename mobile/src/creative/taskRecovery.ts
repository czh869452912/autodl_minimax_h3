import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';

export async function unknownTaskReviewed(db:AppDatabase,jobId:string){
  return Boolean(await db.getFirstAsync('SELECT id FROM workflow_job_events WHERE id=?',`${jobId}:unknown-reviewed`));
}

/** Records the user's review, without changing remote facts or repeating SUBMIT. */
export async function acknowledgeUnknownTask(db:AppDatabase,jobId:string,now=Date.now()){
  await withWriteTransaction(db,async tx=>{
    const job=await tx.getFirstAsync<{status:string}>('SELECT status FROM workflow_jobs WHERE id=?',jobId);
    if(job?.status!=='UNKNOWN')throw new Error('任务状态已变化，请重新查看');
    if(!await tx.getFirstAsync('SELECT job_id FROM creative_job_contexts WHERE job_id=?',jobId))throw new Error('此任务不属于创作工作台');
    if(await unknownTaskReviewed(tx,jobId))return;
    const last=await tx.getFirstAsync<{sequence:number}>('SELECT MAX(sequence) AS sequence FROM workflow_job_events WHERE job_id=?',jobId);
    await tx.runAsync('INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES(?,?,?,?,?,?)',`${jobId}:unknown-reviewed`,jobId,(last?.sequence??-1)+1,'UNKNOWN_REVIEWED',JSON.stringify({allowNewAttempt:true}),now);
  });
}
