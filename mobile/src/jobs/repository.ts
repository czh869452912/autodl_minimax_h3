import type { SQLiteDatabase } from 'expo-sqlite';
import type { JobRecord, JobRepository, ArtifactRecord, JobStatus } from './types';
import { assertAppDatabaseWritable } from '../storage/database';

type JobRow = { id: string; revision?: number; workflow_id: string; workflow_version: string; workflow_hash: string; adapter_id: string; adapter_version: string; input_json: string; output_mapping_json?: string; provider_handle_json?: string; remote_json?: string; status: string; last_error_json?: string; error_json?: string; next_sync_at?: number; created_at: number; updated_at: number; started_at?: number; execution_duration?: number };
type ArtifactRow = { id: string; job_id: string; kind: string; uri?: string; mime?: string; metadata_json?: string };

function parseJson<T>(source: string | null | undefined, fallback: T): T {
  if (!source) return fallback;
  try { return JSON.parse(source) as T; } catch { return fallback; }
}

export function createJobRepository(db: SQLiteDatabase | undefined): JobRepository & { listRecent(limit: number): Promise<JobRecord[]> } {
  const jobs = new Map<string, JobRecord>();
  const artifacts = new Map<string, ArtifactRecord[]>();
  const database = db && typeof (db as unknown as { execSync?: unknown }).execSync === 'function' ? db : undefined;
  const fromJob = (row: JobRow): JobRecord => {
    const providerHandle = parseJson<Readonly<Record<string, unknown>> | undefined>(row.provider_handle_json, parseJson(row.remote_json, undefined));
    const lastError = parseJson(row.last_error_json, parseJson(row.error_json, undefined));
    return { id: row.id, revision: Number(row.revision ?? 0), workflowId: row.workflow_id, workflowVersion: row.workflow_version, workflowContentHash: row.workflow_hash, adapterId: row.adapter_id, adapterVersion: row.adapter_version, inputSnapshot: parseJson(row.input_json, {}), outputMapping: parseJson(row.output_mapping_json, undefined), providerHandle, lastError, nextSyncAt: row.next_sync_at == null ? undefined : Number(row.next_sync_at), remote: parseJson(row.remote_json, undefined), status: row.status as JobStatus, error: parseJson(row.error_json, undefined), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), startedAt: row.started_at == null ? undefined : Number(row.started_at), executionDuration: row.execution_duration == null ? undefined : Number(row.execution_duration) };
  };
  const fromArtifact = (row: ArtifactRow): ArtifactRecord => ({ id: row.id, jobId: row.job_id, kind: row.kind as ArtifactRecord['kind'], uri: row.uri || undefined, mime: row.mime || undefined, metadata: parseJson(row.metadata_json, undefined) });
  const run = async (sql: string, ...params: any[]) => {
    assertAppDatabaseWritable(database);
    return typeof (database as any)?.runAsync === 'function' ? (database as any).runAsync(sql, ...params) : database?.runSync(sql, ...params);
  };
  const all = async <T>(sql: string, ...params: any[]): Promise<T[]> => typeof (database as any)?.getAllAsync === 'function' ? ((await (database as any).getAllAsync(sql, ...params)) ?? []) : ((database?.getAllSync<T>(sql, ...params) ?? []) as T[]);
  const first = async <T>(sql: string, ...params: any[]): Promise<T | null> => typeof (database as any)?.getFirstAsync === 'function' ? ((await (database as any).getFirstAsync(sql, ...params)) ?? null) : database ? ((database.getFirstSync<JobRow>(sql, ...params) as unknown as T | null) ?? null) : null;
  return {
    async upsert(job) {
      if (!database) jobs.set(job.id, job);
      else await run('INSERT OR REPLACE INTO workflow_jobs (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,provider_handle_json,remote_json,status,last_error_json,error_json,next_sync_at,created_at,updated_at,started_at,execution_duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', job.id, job.revision, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion, JSON.stringify(job.inputSnapshot), job.outputMapping ? JSON.stringify(job.outputMapping) : null, job.providerHandle ? JSON.stringify(job.providerHandle) : job.remote ? JSON.stringify(job.remote) : null, job.remote ? JSON.stringify(job.remote) : job.providerHandle ? JSON.stringify(job.providerHandle) : null, job.status, job.lastError ? JSON.stringify(job.lastError) : job.error ? JSON.stringify(job.error) : null, job.error ? JSON.stringify(job.error) : job.lastError ? JSON.stringify(job.lastError) : null, job.nextSyncAt ?? null, job.createdAt, job.updatedAt, job.startedAt ?? null, job.executionDuration ?? null);
    },
    async get(id) {
      if (!database) return jobs.get(id);
      const row = await first<JobRow>('SELECT * FROM workflow_jobs WHERE id = ? LIMIT 1', id);
      return row ? fromJob(row) : undefined;
    },
    async list() {
      if (!database) return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
      return (await all<JobRow>('SELECT * FROM workflow_jobs ORDER BY created_at DESC')).map(fromJob);
    },
    async listRecent(limit: number) {
      const bounded = Math.max(0, Math.floor(limit));
      if (bounded === 0) return [];
      if (!database) return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, bounded);
      return (await all<JobRow>('SELECT * FROM workflow_jobs ORDER BY created_at DESC LIMIT ?', bounded)).map(fromJob);
    },
    async listActive() {
      if (!database) return Array.from(jobs.values()).filter((job) => ['QUEUED', 'RUNNING', 'UNKNOWN'].includes(job.status)).sort((a, b) => a.updatedAt - b.updatedAt);
      return (await all<JobRow>("SELECT * FROM workflow_jobs WHERE status IN ('QUEUED','RUNNING','UNKNOWN') ORDER BY updated_at ASC, id ASC")).map(fromJob);
    },
    async replaceArtifacts(jobId, values) {
      if (!database) { artifacts.set(jobId, values); return; }
      assertAppDatabaseWritable(database);
      const transaction = (database as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
      const exclusiveTransaction = (database as unknown as {
        withExclusiveTransactionAsync?: (
          fn: (transaction: { runAsync(sql: string, ...params: any[]): Promise<unknown> }) => Promise<void>,
        ) => Promise<void>;
      }).withExclusiveTransactionAsync;
      const replace = () => {
        database.runSync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
        for (const value of values) database.runSync('INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)', value.id, jobId, value.kind, value.uri ?? null, value.mime ?? null, value.metadata ? JSON.stringify(value.metadata) : null);
      };
      if (exclusiveTransaction) {
        await exclusiveTransaction.call(database, async (exclusive) => {
          await exclusive.runAsync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
          for (const value of values) await exclusive.runAsync('INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)', value.id, jobId, value.kind, value.uri ?? null, value.mime ?? null, value.metadata ? JSON.stringify(value.metadata) : null);
        });
        return;
      }
      if (transaction) transaction.call(database, replace);
      else {
        database.execSync('BEGIN');
        try { replace(); database.execSync('COMMIT'); } catch (error) { try { database.execSync('ROLLBACK'); } catch {} throw error; }
      }
    },
    async listArtifacts(jobId) {
      if (!database) return artifacts.get(jobId) ?? [];
      return (await all<ArtifactRow>('SELECT * FROM workflow_artifacts WHERE job_id = ?', jobId)).map(fromArtifact);
    },
  };
}
