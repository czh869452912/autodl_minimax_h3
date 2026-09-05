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

export async function persistSubmissionCommand(database: SQLiteDatabase, submissionId: string, prepared: PreparedWorkflowSubmission,
  media: { images: TaskMediaInput[]; audios: TaskMediaInput[] }, now = Date.now()): Promise<TaskRecord> {
  const job: JobRecord = { id: `job:${submissionId}`, revision: 0, workflowId: prepared.workflowId, workflowVersion: prepared.workflowVersion,
    workflowContentHash: prepared.workflowContentHash, adapterId: prepared.adapterId, adapterVersion: prepared.adapterVersion,
    inputSnapshot: prepared.inputSnapshot, outputMapping: prepared.outputMapping, status: 'READY_TO_SUBMIT', createdAt: now, updatedAt: now };
  const task = { ...jobToTaskProjection(job, []), ...media };
  await withWriteTransaction(database, async db => {
    await assertAppDatabaseWritableAsync(db);
    const inserted = await db.runAsync(`INSERT OR IGNORE INTO workflow_jobs
      (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,status,created_at,updated_at)
      VALUES(?,0,?,?,?,?,?,?,?,'READY_TO_SUBMIT',?,?)`, job.id, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion,
    JSON.stringify(job.inputSnapshot), job.outputMapping ? JSON.stringify(job.outputMapping) : null, now, now);
    if (inserted.changes) {
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
