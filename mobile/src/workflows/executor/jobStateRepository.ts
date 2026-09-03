import type { SQLiteDatabase } from 'expo-sqlite';
import type { JobRecord, JobStatus, NormalizedError } from '../../jobs/types';
import { assertAppDatabaseWritable } from '../../storage/database';
import type { EnqueueOperation, JobEvent, ProviderHandle, TransitionResult } from './types';

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

function transaction<T>(db: SQLiteDatabase, work: () => T): T {
  if (typeof db.withTransactionSync === 'function') {
    let value!: T;
    db.withTransactionSync(() => { value = work(); });
    return value;
  }
  db.execSync('BEGIN IMMEDIATE');
  try {
    const value = work();
    db.execSync('COMMIT');
    return value;
  } catch (error) {
    try { db.execSync('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  }
}

function insertOperation(db: SQLiteDatabase, operation: EnqueueOperation): void {
  db.runSync(
    "INSERT OR IGNORE INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,'PENDING',0,?,?,?)",
    operation.id, operation.kind, operation.jobId ?? null, operation.idempotencyKey, JSON.stringify(operation.payload),
    operation.nextRetryAt ?? operation.now, operation.now, operation.now,
  );
}

function insertEvent(db: SQLiteDatabase, jobId: string, sequence: number, event: NewEvent): JobEvent {
  db.runSync(
    'INSERT INTO workflow_job_events (id,job_id,sequence,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?)',
    event.id, jobId, sequence, event.type, JSON.stringify(event.payload), event.createdAt,
  );
  return { ...event, jobId, sequence };
}

export function createJobStateRepository(db: SQLiteDatabase) {
  const get = (id: string): JobRecord | undefined => {
    const row = db.getFirstSync<JobRow>('SELECT * FROM workflow_jobs WHERE id = ? LIMIT 1', id);
    return row ? mapJob(row) : undefined;
  };
  return {
    get,
    listEvents(jobId: string): JobEvent[] {
      return db.getAllSync<EventRow>('SELECT * FROM workflow_job_events WHERE job_id = ? ORDER BY sequence ASC', jobId).map(mapEvent);
    },
    createWithEventAndOperation(job: JobRecord, event: NewEvent, operation: EnqueueOperation): JobRecord {
      assertAppDatabaseWritable(db);
      const existing = get(job.id);
      if (existing) return existing;
      return transaction(db, () => {
        const current = get(job.id);
        if (current) return current;
        db.runSync(
          'INSERT INTO workflow_jobs (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,provider_handle_json,remote_json,status,last_error_json,error_json,next_sync_at,created_at,updated_at,started_at,execution_duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          job.id, 0, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion,
          JSON.stringify(job.inputSnapshot), job.outputMapping ? JSON.stringify(job.outputMapping) : null,
          job.providerHandle ? JSON.stringify(job.providerHandle) : job.remote ? JSON.stringify(job.remote) : null,
          job.remote ? JSON.stringify(job.remote) : job.providerHandle ? JSON.stringify(job.providerHandle) : null,
          job.status, job.lastError ? JSON.stringify(job.lastError) : job.error ? JSON.stringify(job.error) : null,
          job.error ? JSON.stringify(job.error) : job.lastError ? JSON.stringify(job.lastError) : null,
          job.nextSyncAt ?? null, job.createdAt, job.updatedAt, job.startedAt ?? null, job.executionDuration ?? null,
        );
        insertEvent(db, job.id, 0, event);
        insertOperation(db, operation);
        const created = get(job.id);
        if (!created) throw new Error('job creation failed');
        return created;
      });
    },
    transition(input: JobTransition): TransitionResult {
      assertAppDatabaseWritable(db);
      return transaction(db, () => {
        const current = get(input.jobId);
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

        const result = db.runSync(
          `UPDATE workflow_jobs SET ${assignments.join(', ')} WHERE id = ? AND revision = ?`,
          ...values, input.jobId, input.expectedRevision,
        );
        if (!changed(result)) {
          const conflicted = get(input.jobId);
          if (!conflicted) throw new Error(`job not found: ${input.jobId}`);
          return { ok: false, current: conflicted };
        }
        const event = insertEvent(db, input.jobId, input.expectedRevision + 1, input.event);
        for (const operation of input.nextOperations ?? []) insertOperation(db, operation);
        const updated = get(input.jobId);
        if (!updated) throw new Error('job transition failed');
        return { ok: true, current: updated, event };
      });
    },
  };
}

export type JobStateRepository = ReturnType<typeof createJobStateRepository>;
