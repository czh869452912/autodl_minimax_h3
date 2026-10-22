import { createId } from '../ids';
import { cancelArtifactTransfer } from '../native/media';
import { withWriteTransaction } from '../storage/sqliteBusy';
import type { AppDatabase } from '../storage/appDatabase';
import { createMediaCommandService, type MediaCommandService } from '../workflows/executor/mediaCommandService';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { executorWakePort } from './executorEvents';
import { taskProjectionEvents } from './taskProjectionEvents';

export type CommandReceipt = Readonly<{ status: 'accepted' | 'coalesced' | 'already-complete'; wakeGeneration: number; acceptedAt: number }>;

export function createTaskCommandService(options: {
  db: AppDatabase; fileExists(uri: string): Promise<boolean>; resolveCasUri(path: string): string;
  refreshArtifactSources?: (taskId: string) => Promise<void>;
  now?: () => number; invalidate?: () => void; signal?: () => void;
}) {
  const now = options.now ?? Date.now;
  const execute = async (command?: (media: MediaCommandService) => ReturnType<MediaCommandService['requestDownload']>): Promise<CommandReceipt> => {
    let receipt!: CommandReceipt;
    await withWriteTransaction(options.db, async db => {
      const result = command ? await command(createMediaCommandService({ ...options, db, insideTransaction: true })) : undefined;
      const acceptedAt = now();
      if (!command) await db.runAsync(`UPDATE workflow_operations SET state='PENDING',attempt=0,next_retry_at=?,last_error_json=NULL,updated_at=?
        WHERE state='BLOCKED' AND COALESCE(json_extract(last_error_json,'$.code'),'')<>'USER_CANCELLED' AND (kind='STATUS_SYNC' OR (kind<>'SUBMIT' AND json_extract(last_error_json,'$.code')='EXECUTOR_UNEXPECTED_ERROR'))`, acceptedAt, acceptedAt);
      const wake = await createExecutorWakeRepository(db).requestWake(acceptedAt, command ? undefined : 'force-next-slice');
      receipt = { status: result?.status === 'already-complete' ? 'already-complete' : result?.status === 'in-flight' || (!command && wake.maintenanceGeneration < wake.generation) ? 'coalesced' : 'accepted', wakeGeneration: wake.generation, acceptedAt };
    });
    (options.invalidate ?? taskProjectionEvents.invalidate)();
    (options.signal ?? (() => executorWakePort.signal('command')))();
    return receipt;
  };
  return {
    async replaceUnknownAfterConfirmation(taskId: string) {
      const replacement = 'job:' + createId();
      await withWriteTransaction(options.db, async db => {
        const job = await db.getFirstAsync<{ status: string }>('SELECT status FROM workflow_jobs WHERE id=?', taskId);
        if (job?.status !== 'UNKNOWN') throw new Error('只有待确认任务可以重新创建');
        const already = await db.getFirstAsync('SELECT 1 FROM workflow_job_events WHERE id=?', taskId + ':replacement-confirmed');
        if (already) throw new Error('已为此任务创建新尝试，请在任务列表查看');
        const source = await db.getFirstAsync<{ payload_json: string }>("SELECT payload_json FROM workflow_operations WHERE job_id=? AND kind='SUBMIT' LIMIT 1", taskId);
        if (!source || !JSON.parse(source.payload_json).prepared) throw new Error('原始提交数据不可用');
        const task = await db.getFirstAsync('SELECT 1 FROM tasks WHERE id=?', taskId);
        if (!task) throw new Error('原始任务记录不存在');
        const at = now();
        await db.runAsync(`INSERT INTO workflow_jobs(id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,status,created_at,updated_at)
          SELECT ?,0,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,'READY_TO_SUBMIT',?,? FROM workflow_jobs WHERE id=?`, replacement, at, at, taskId);
        await db.runAsync(`INSERT INTO tasks(id,prompt,status,resolution,duration,seed,images_json,audios_json,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,created_at,updated_at)
          SELECT ?,prompt,'QUEUED',resolution,duration,seed,images_json,audios_json,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,?,? FROM tasks WHERE id=?`, replacement, at, at, taskId);
        await db.runAsync("INSERT INTO artifact_blob_refs(blob_sha256,owner_type,owner_id,created_at) SELECT blob_sha256,owner_type,?,? FROM artifact_blob_refs WHERE owner_type='task_input' AND owner_id=?", replacement, at, taskId);
        await db.runAsync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,next_retry_at,created_at,updated_at) VALUES(?,'SUBMIT',?,?,?,'PENDING',?,?,?)", replacement+':submit', replacement, 'submit:'+replacement, source.payload_json, at, at, at);
        await db.runAsync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) SELECT ?,?,COALESCE(MAX(sequence),-1)+1,'REPLACEMENT_CONFIRMED',?,? FROM workflow_job_events WHERE job_id=?", taskId+':replacement-confirmed', taskId, JSON.stringify({ replacementJobId: replacement }), at, taskId);
        await db.runAsync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) VALUES(?,?,0,'REPLACEMENT_CONFIRMED',?,?)", replacement+':created', replacement, JSON.stringify({ originalJobId: taskId }), at);
        await createExecutorWakeRepository(db).requestWake(at);
      });
      (options.invalidate ?? taskProjectionEvents.invalidate)();
      (options.signal ?? (() => executorWakePort.signal('command')))();
      return replacement;
    },
    async setArchived(taskId: string, archived: boolean) {
      await withWriteTransaction(options.db, async db => {
        if (archived) await db.runAsync('INSERT OR IGNORE INTO task_archives(task_id,archived_at) SELECT id,? FROM tasks WHERE id=?', now(), taskId);
        else await db.runAsync('DELETE FROM task_archives WHERE task_id=?', taskId);
      });
      (options.invalidate ?? taskProjectionEvents.invalidate)();
    },
    async requestCancel(taskId: string) {
      await withWriteTransaction(options.db, async db => {
        const job = await db.getFirstAsync<{ status: string }>('SELECT status FROM workflow_jobs WHERE id=?', taskId);
        if (job?.status === 'CANCELLED') return;
        const submit = await db.getFirstAsync<{ id: string; state: string; attempt: number }>("SELECT id,state,attempt FROM workflow_operations WHERE job_id=? AND kind='SUBMIT' ORDER BY created_at LIMIT 1", taskId);
        if (!submit || submit.state !== 'PENDING' || submit.attempt !== 0) throw new Error('任务已交给服务端，当前接口不支持取消生成。可继续等待结果；移除本地记录不会停止服务端任务。');
        const at = now();
        await db.runAsync("UPDATE workflow_operations SET state='BLOCKED',last_error_json=?,updated_at=? WHERE job_id=? AND state='PENDING'", JSON.stringify({ code: 'USER_CANCELLED', message: '用户取消本地排队' }), at, taskId);
        await db.runAsync("UPDATE workflow_jobs SET status='CANCELLED',revision=revision+1,updated_at=?,next_sync_at=NULL WHERE id=?", at, taskId);
        await db.runAsync("UPDATE tasks SET status='CANCELLED',sync_error=NULL,updated_at=? WHERE id=?", at, taskId);
        await db.runAsync("INSERT INTO workflow_job_events(id,job_id,sequence,event_type,payload_json,created_at) SELECT ?,?,COALESCE(MAX(sequence),-1)+1,'cancelled','{}',? FROM workflow_job_events WHERE job_id=?", `${taskId}:cancel:${at}`, taskId, at, taskId);
      });
      (options.invalidate ?? taskProjectionEvents.invalidate)();
    },
    async requestCancelMedia(taskId: string, kind: 'ARTIFACT_DOWNLOAD' | 'EXPORT') {
      let cancelled: Array<{ id: string; attempt: number }> = [];
      await withWriteTransaction(options.db, async db => {
        const active = await db.getAllAsync<{ id: string; state: string; attempt: number }>("SELECT id,state,attempt FROM workflow_operations WHERE job_id=? AND kind=? AND state IN ('PENDING','CLAIMED')", taskId, kind);
        if (kind === 'EXPORT' && active.some(op => op.state === 'CLAIMED')) throw new Error('相册保存已开始，请等待保存完成');
        if (!active.length) return;
        cancelled = active;
        const at = now();
        await db.runAsync("UPDATE workflow_operations SET state='BLOCKED',lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE job_id=? AND kind=? AND state IN ('PENDING','CLAIMED')", JSON.stringify({ code: 'USER_CANCELLED', message: '用户已取消', retryable: false }), at, taskId, kind);
        if (kind === 'ARTIFACT_DOWNLOAD') {
          await db.runAsync("UPDATE tasks SET download_state='DOWNLOAD_FAILED',download_error='USER_CANCELLED',download_progress=NULL,export_state=CASE WHEN export_state='QUEUED' THEN 'NOT_REQUESTED' ELSE export_state END,updated_at=? WHERE id=?", at, taskId);
          await db.runAsync("UPDATE media_assets SET status='failed',export_status=CASE WHEN export_status='QUEUED' THEN 'NOT_REQUESTED' ELSE export_status END,updated_at=? WHERE task_id=? AND status IN ('queued','downloading')", at, taskId);
          await db.runAsync("DELETE FROM media_deliveries WHERE asset_id IN (SELECT id FROM media_assets WHERE task_id=?) AND status='QUEUED'", taskId);
        } else {
          await db.runAsync("UPDATE tasks SET export_state='NOT_REQUESTED',export_error=NULL,updated_at=? WHERE id=?", at, taskId);
          await db.runAsync("UPDATE media_assets SET export_status='NOT_REQUESTED',updated_at=? WHERE task_id=?", at, taskId);
          await db.runAsync("DELETE FROM media_deliveries WHERE asset_id IN (SELECT id FROM media_assets WHERE task_id=?) AND status='QUEUED'", taskId);
        }
      });
      if (kind === 'ARTIFACT_DOWNLOAD') await Promise.all(cancelled.map(op => cancelArtifactTransfer(op.id, op.attempt).catch(() => false)));
      (options.invalidate ?? taskProjectionEvents.invalidate)();
    },
    requestRefresh: (_options: { maintenance: 'force-next-slice' }) => execute(),
    requestDownload: async (taskId: string) => { await options.refreshArtifactSources?.(taskId); return execute(media => media.requestDownload(taskId)); },
    requestRedownload: async (taskId: string) => { await options.refreshArtifactSources?.(taskId); return execute(media => media.requestRedownload(taskId)); },
    requestExport: (taskId: string, policy: { keepPrivateCopy: boolean }) => execute(media => media.requestExport(taskId, policy)),
  };
}
export type TaskCommandService = ReturnType<typeof createTaskCommandService>;
