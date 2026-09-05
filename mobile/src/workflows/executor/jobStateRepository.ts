import { withWriteTransaction } from '../../storage/sqliteBusy';
import { createTaskRepository } from '../../tasks/repository';
import { jobToTaskProjection } from '../../tasks/projection';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ArtifactRecord, JobRecord, JobStatus, NormalizedError } from '../../jobs/types';
import { assertAppDatabaseWritableAsync } from '../../storage/database';
import type { EnqueueOperation, JobEvent, ProviderHandle, TransitionResult } from './types';
import type { TerminalTaskEvent, TerminalTaskStatus } from '../../tasks/terminalEvents';

type JobRow = {
  id: string; revision: number; workflow_id: string; workflow_version: string; workflow_hash: string;
  adapter_id: string; adapter_version: string; input_json: string; output_mapping_json?: string | null;
  provider_handle_json?: string | null; remote_json?: string | null; status: JobStatus;
  last_error_json?: string | null; error_json?: string | null; next_sync_at?: number | null;
  created_at: number; updated_at: number; started_at?: number | null; execution_duration?: number | null;
};
type EventRow = { id: string; job_id: string; sequence: number; event_type: string; payload_json: string; created_at: number };
type NewEvent = Omit<JobEvent, 'jobId' | 'sequence'>;

export type JobTransition = {
  jobId: string;
  expectedRevision: number;
  patch: Partial<Pick<JobRecord, 'status' | 'providerHandle' | 'lastError' | 'nextSyncAt' | 'remote' | 'error' | 'updatedAt' | 'startedAt' | 'executionDuration'>>;
  event: NewEvent;
  artifacts?: ArtifactRecord[];
  nextOperations?: EnqueueOperation[];
};

function parseJson<T>(source: string | null | undefined, fallback: T): T {
  if (!source) return fallback;
  try { return JSON.parse(source) as T; } catch { return fallback; }
}

function mapJob(row: JobRow): JobRecord {
  const providerHandle = parseJson<ProviderHandle | undefined>(row.provider_handle_json, parseJson(row.remote_json, undefined));
  const lastError = parseJson<NormalizedError | undefined>(row.last_error_json, parseJson(row.error_json, undefined));
  return {
    id: row.id, revision: Number(row.revision), workflowId: row.workflow_id, workflowVersion: row.workflow_version,
    workflowContentHash: row.workflow_hash, adapterId: row.adapter_id, adapterVersion: row.adapter_version,
    inputSnapshot: parseJson(row.input_json, {}), outputMapping: parseJson(row.output_mapping_json, undefined),
    providerHandle, lastError, nextSyncAt: row.next_sync_at == null ? undefined : Number(row.next_sync_at),
    remote: parseJson(row.remote_json, undefined), error: parseJson(row.error_json, undefined), status: row.status,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    startedAt: row.started_at == null ? undefined : Number(row.started_at),
    executionDuration: row.execution_duration == null ? undefined : Number(row.execution_duration),
  };
}

function mapEvent(row: EventRow): JobEvent {
  return { id: row.id, jobId: row.job_id, sequence: Number(row.sequence), type: row.event_type, payload: parseJson(row.payload_json, {}), createdAt: Number(row.created_at) };
}

function changed(result: unknown): boolean {
  const value = (result as { changes?: number | bigint } | undefined)?.changes;
  return value != null && Number(value) === 1;
}

function terminalStatus(value: unknown): TerminalTaskStatus | undefined {
  switch (value) {
    case 'SUCCEEDED': return 'SUCCESS';
    case 'PARTIAL_SUCCEEDED': return 'PARTIAL_SUCCESS';
    case 'FAILED': return 'FAILED';
    case 'CANCELLED': return 'CANCELLED';
    default: return undefined;
  }
}

async function insertOperation(db: SQLiteDatabase, operation: EnqueueOperation): Promise<void> {
  await db.runAsync(
    "INSERT OR IGNORE INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,'PENDING',0,?,?,?)",
    operation.id, operation.kind, operation.jobId ?? null, operation.idempotencyKey, JSON.stringify(operation.payload),
    operation.nextRetryAt ?? operation.now, operation.now, operation.now,
  );
}

async function insertEvent(db: SQLiteDatabase, jobId: string, sequence: number, event: NewEvent): Promise<JobEvent> {
  await db.runAsync(
    'INSERT INTO workflow_job_events (id,job_id,sequence,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?)',
    event.id, jobId, sequence, event.type, JSON.stringify(event.payload), event.createdAt,
  );
  return { ...event, jobId, sequence };
}

async function replaceArtifacts(db: SQLiteDatabase, jobId: string, artifacts: ArtifactRecord[]): Promise<void> {
  await db.runAsync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
  for (const artifact of artifacts) {
    await db.runAsync(
      'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
      artifact.id,
      jobId,
      artifact.kind,
      artifact.uri ?? null,
      artifact.mime ?? null,
      artifact.metadata ? JSON.stringify(artifact.metadata) : null,
    );
  }
}

export function createJobStateRepository(db: SQLiteDatabase) {
  const get = async (id: string): Promise<JobRecord | undefined> => {
    const row = await db.getFirstAsync<JobRow>('SELECT * FROM workflow_jobs WHERE id = ? LIMIT 1', id);
    return row ? mapJob(row) : undefined;
  };
  return {
    get,
    async listEvents(jobId: string): Promise<JobEvent[]> {
      return (await db.getAllAsync<EventRow>('SELECT * FROM workflow_job_events WHERE job_id = ? ORDER BY sequence ASC', jobId)).map(mapEvent);
    },
    async listTerminalEvents(jobIds: string[]): Promise<TerminalTaskEvent[]> {
      const ids = [...new Set(jobIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.getAllAsync<EventRow & { job_status: string }>(
        `SELECT e.*,j.status AS job_status FROM workflow_job_events e JOIN workflow_jobs j ON j.id=e.job_id WHERE e.event_type='STATUS_RECONCILED' AND e.job_id IN (${placeholders}) AND j.status IN ('SUCCEEDED','PARTIAL_SUCCEEDED','FAILED','CANCELLED') ORDER BY e.created_at ASC,e.id ASC`,
        ...ids,
      );
      return rows.flatMap((row) => {
        const current = terminalStatus(row.job_status);
        const payload = parseJson<{ status?: unknown }>(row.payload_json, {});
        const eventStatus = terminalStatus(payload.status);
        if (!current || !eventStatus || current !== eventStatus) return [];
        return [{ eventId: row.id, taskId: row.job_id, status: current, createdAt: Number(row.created_at) }];
      });
    },
    async createWithEventAndOperation(job: JobRecord, event: NewEvent, operation: EnqueueOperation): Promise<JobRecord> {
      await assertAppDatabaseWritableAsync(db);
      const existing = await get(job.id);
      if (existing) return existing;
      return withWriteTransaction(db, async db => {
        const get = createJobStateRepository(db).get;
        const current = await get(job.id);
        if (current) return current;
        await db.runAsync(
          'INSERT INTO workflow_jobs (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,provider_handle_json,remote_json,status,last_error_json,error_json,next_sync_at,created_at,updated_at,started_at,execution_duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          job.id, 0, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion,
          JSON.stringify(job.inputSnapshot), job.outputMapping ? JSON.stringify(job.outputMapping) : null,
          job.providerHandle ? JSON.stringify(job.providerHandle) : job.remote ? JSON.stringify(job.remote) : null,
          job.remote ? JSON.stringify(job.remote) : job.providerHandle ? JSON.stringify(job.providerHandle) : null,
          job.status, job.lastError ? JSON.stringify(job.lastError) : job.error ? JSON.stringify(job.error) : null,
          job.error ? JSON.stringify(job.error) : job.lastError ? JSON.stringify(job.lastError) : null,
          job.nextSyncAt ?? null, job.createdAt, job.updatedAt, job.startedAt ?? null, job.executionDuration ?? null,
        );
        await insertEvent(db, job.id, 0, event);
        await insertOperation(db, operation);
        const created = await get(job.id);
        if (!created) throw new Error('job creation failed');
        await createTaskRepository(db).upsertWorkflowProjection(jobToTaskProjection(created));
        return created;
      });
    },
    async transition(input: JobTransition): Promise<TransitionResult> {
      await assertAppDatabaseWritableAsync(db);
      return withWriteTransaction(db, async db => {
        const get = createJobStateRepository(db).get;
        const current = await get(input.jobId);
        if (!current) throw new Error(`job not found: ${input.jobId}`);
        if (current.revision !== input.expectedRevision) return { ok: false, current };

        const assignments = ['revision = revision + 1'];
        const values: any[] = [];
        const add = (column: string, value: unknown) => { assignments.push(`${column} = ?`); values.push(value); };
        if (Object.prototype.hasOwnProperty.call(input.patch, 'status')) add('status', input.patch.status);
        if (Object.prototype.hasOwnProperty.call(input.patch, 'providerHandle')) {
          const value = input.patch.providerHandle ? JSON.stringify(input.patch.providerHandle) : null;
          add('provider_handle_json', value);
          add('remote_json', value);
        } else if (Object.prototype.hasOwnProperty.call(input.patch, 'remote')) add('remote_json', input.patch.remote ? JSON.stringify(input.patch.remote) : null);
        if (Object.prototype.hasOwnProperty.call(input.patch, 'lastError')) {
          const value = input.patch.lastError ? JSON.stringify(input.patch.lastError) : null;
          add('last_error_json', value);
          add('error_json', value);
        } else if (Object.prototype.hasOwnProperty.call(input.patch, 'error')) add('error_json', input.patch.error ? JSON.stringify(input.patch.error) : null);
        if (Object.prototype.hasOwnProperty.call(input.patch, 'nextSyncAt')) add('next_sync_at', input.patch.nextSyncAt ?? null);
        if (Object.prototype.hasOwnProperty.call(input.patch, 'startedAt')) add('started_at', input.patch.startedAt ?? null);
        if (Object.prototype.hasOwnProperty.call(input.patch, 'executionDuration')) add('execution_duration', input.patch.executionDuration ?? null);
        add('updated_at', input.patch.updatedAt ?? input.event.createdAt);

        const result = await db.runAsync(
          `UPDATE workflow_jobs SET ${assignments.join(', ')} WHERE id = ? AND revision = ?`,
          ...values, input.jobId, input.expectedRevision,
        );
        if (!changed(result)) {
          const conflicted = await get(input.jobId);
          if (!conflicted) throw new Error(`job not found: ${input.jobId}`);
          return { ok: false, current: conflicted };
        }
        if (input.artifacts !== undefined) await replaceArtifacts(db, input.jobId, input.artifacts);
        const event = await insertEvent(db, input.jobId, input.expectedRevision + 1, input.event);
        for (const operation of input.nextOperations ?? []) await insertOperation(db, operation);
        const updated = await get(input.jobId);
        if (!updated) throw new Error('job transition failed');
        const tasks = createTaskRepository(db);
        const previous = await tasks.get(updated.id);
        await tasks.upsertWorkflowProjection(jobToTaskProjection(updated, input.artifacts, previous));
        return { ok: true, current: updated, event };
      });
    },
  };
}

export type JobStateRepository = ReturnType<typeof createJobStateRepository>;
