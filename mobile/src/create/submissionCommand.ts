import { withWriteTransaction } from '../storage/sqliteBusy';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { PreparedWorkflowSubmission } from '../workflows/runtime/runtime';
import type { JobRecord } from '../jobs/types';
import type { TaskMediaInput, TaskRecord } from '../tasks/types';
import { jobToTaskProjection } from '../tasks/projection';
import { createExecutorWakeRepository } from '../tasks/executorWakeRepository';
import { taskProjectionEvents } from '../tasks/taskProjectionEvents';
import { executorWakePort } from '../tasks/executorEvents';
import { assertAppDatabaseWritableAsync } from '../storage/database';
import { attachmentHashes, createAttachmentStore } from '../agent/attachmentStore';

export async function persistSubmissionCommand(database: SQLiteDatabase, submissionId: string, prepared: PreparedWorkflowSubmission,
  media: { images: TaskMediaInput[]; audios: TaskMediaInput[]; handoffId?: string }, now = Date.now()): Promise<TaskRecord> {
  const job: JobRecord = { id: `job:${submissionId}`, revision: 0, workflowId: prepared.workflowId, workflowVersion: prepared.workflowVersion,
    workflowContentHash: prepared.workflowContentHash, adapterId: prepared.adapterId, adapterVersion: prepared.adapterVersion,
    inputSnapshot: prepared.inputSnapshot, outputMapping: prepared.outputMapping, status: 'READY_TO_SUBMIT', createdAt: now, updatedAt: now };
  const task = { ...jobToTaskProjection(job, []), images: media.images, audios: media.audios };
  await withWriteTransaction(database, async db => {
    await assertAppDatabaseWritableAsync(db);
    const inserted = await db.runAsync(`INSERT OR IGNORE INTO workflow_jobs
      (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,status,created_at,updated_at)
      VALUES(?,0,?,?,?,?,?,?,?,'READY_TO_SUBMIT',?,?)`, job.id, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion,
    JSON.stringify(job.inputSnapshot), job.outputMapping ? JSON.stringify(job.outputMapping) : null, now, now);
    if (inserted.changes) {
      const assets = createAttachmentStore(db);
      await assets.retain(db, 'task_input', task.id, attachmentHashes([media.images, media.audios, prepared.inputSnapshot]));
      if (media.handoffId) {
        const handoff = await db.getFirstAsync<{ status: string; payload_json: string }>('SELECT status,payload_json FROM agent_handoffs WHERE id=?', media.handoffId);
        if (!handoff || handoff.status !== 'applied') throw new Error('提示词交接尚未确认或已提交，请重新打开创建页');
        await db.runAsync("UPDATE agent_handoffs SET status='submitted',payload_json=? WHERE id=?", JSON.stringify({ ...JSON.parse(handoff.payload_json), submittedTaskId: task.id }), media.handoffId);
        await assets.release(db, 'create_form', media.handoffId);
        await assets.release(db, 'agent_handoff', media.handoffId);
      }
      await db.runAsync(`INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES(?,?,0,'VALIDATED',?,?)`,
        `${job.id}:event:0:validated`, job.id, JSON.stringify({ workflowContentHash: job.workflowContentHash }), now);
      await db.runAsync(`INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at)
        VALUES(?,'SUBMIT',?,?,?,'PENDING',0,?,?,?)`, `${job.id}:submit`, job.id, `submit:${submissionId}`, JSON.stringify({ prepared }), now, now, now);
      await db.runAsync(`INSERT INTO tasks(id,prompt,status,resolution,duration,seed,images_json,audios_json,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, task.id, task.prompt, task.status, task.resolution, task.duration, task.seed ?? null,
      JSON.stringify(media.images), JSON.stringify(media.audios), job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion, JSON.stringify(job.inputSnapshot), now, now);
    }
    await createExecutorWakeRepository(db).requestWake(now);
  });
  taskProjectionEvents.invalidate();
  executorWakePort.signal('command');
  return task;
}
