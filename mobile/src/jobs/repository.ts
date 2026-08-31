import type { SQLiteDatabase } from 'expo-sqlite';
import type { JobRecord, JobRepository, ArtifactRecord, JobStatus } from './types';
import { ensureAppDatabase } from '../storage/database';

type JobRow = { id: string; workflow_id: string; workflow_version: string; workflow_hash: string; adapter_id: string; adapter_version: string; input_json: string; output_mapping_json?: string; remote_json?: string; status: string; error_json?: string; created_at: number; updated_at: number; started_at?: number; execution_duration?: number };
type ArtifactRow = { id: string; job_id: string; kind: string; uri?: string; mime?: string; metadata_json?: string };

function parseJson<T>(source: string | null | undefined, fallback: T): T {
  if (!source) return fallback;
  try { return JSON.parse(source) as T; } catch { return fallback; }
}

export function createJobRepository(db: SQLiteDatabase | undefined): JobRepository {
  const jobs = new Map<string, JobRecord>();
  const artifacts = new Map<string, ArtifactRecord[]>();
  const database = db && typeof (db as unknown as { execSync?: unknown }).execSync === 'function' ? db : undefined;
  if (database) {
    ensureAppDatabase(database);
    database.execSync('CREATE TABLE IF NOT EXISTS workflow_jobs (id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL, workflow_version TEXT NOT NULL, workflow_hash TEXT NOT NULL, adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, input_json TEXT NOT NULL, output_mapping_json TEXT, remote_json TEXT, status TEXT NOT NULL, error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, execution_duration REAL);');
    database.execSync('CREATE TABLE IF NOT EXISTS workflow_artifacts (id TEXT NOT NULL, job_id TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT, mime TEXT, metadata_json TEXT, PRIMARY KEY (job_id, id));');
  }
  const fromJob = (row: JobRow): JobRecord => ({ id: row.id, workflowId: row.workflow_id, workflowVersion: row.workflow_version, workflowContentHash: row.workflow_hash, adapterId: row.adapter_id, adapterVersion: row.adapter_version, inputSnapshot: parseJson(row.input_json, {}), outputMapping: parseJson(row.output_mapping_json, undefined), remote: parseJson(row.remote_json, undefined), status: row.status as JobStatus, error: parseJson(row.error_json, undefined), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), startedAt: row.started_at == null ? undefined : Number(row.started_at), executionDuration: row.execution_duration == null ? undefined : Number(row.execution_duration) });
  const fromArtifact = (row: ArtifactRow): ArtifactRecord => ({ id: row.id, jobId: row.job_id, kind: row.kind as ArtifactRecord['kind'], uri: row.uri || undefined, mime: row.mime || undefined, metadata: parseJson(row.metadata_json, undefined) });
  return {
    async upsert(job) {
      if (!database) jobs.set(job.id, job);
      else database.runSync('INSERT OR REPLACE INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,output_mapping_json,remote_json,status,error_json,created_at,updated_at,started_at,execution_duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', job.id, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion, JSON.stringify(job.inputSnapshot), job.outputMapping ? JSON.stringify(job.outputMapping) : null, job.remote ? JSON.stringify(job.remote) : null, job.status, job.error ? JSON.stringify(job.error) : null, job.createdAt, job.updatedAt, job.startedAt ?? null, job.executionDuration ?? null);
    },
    async get(id) {
      if (!database) return jobs.get(id);
      const row = database.getFirstSync<JobRow>('SELECT * FROM workflow_jobs WHERE id = ? LIMIT 1', id) as JobRow | null;
      return row ? fromJob(row) : undefined;
    },
    async list() {
      if (!database) return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
      return (database.getAllSync<JobRow>('SELECT * FROM workflow_jobs ORDER BY created_at DESC') as JobRow[]).map(fromJob);
    },
    async replaceArtifacts(jobId, values) {
      if (!database) { artifacts.set(jobId, values); return; }
      const transaction = (database as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
      const replace = () => {
        database.runSync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
        for (const value of values) database.runSync('INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)', value.id, jobId, value.kind, value.uri ?? null, value.mime ?? null, value.metadata ? JSON.stringify(value.metadata) : null);
      };
      if (transaction) transaction.call(database, replace);
      else {
        database.execSync('BEGIN');
        try { replace(); database.execSync('COMMIT'); } catch (error) { try { database.execSync('ROLLBACK'); } catch {} throw error; }
      }
    },
    async listArtifacts(jobId) {
      if (!database) return artifacts.get(jobId) ?? [];
      return (database.getAllSync<ArtifactRow>('SELECT * FROM workflow_artifacts WHERE job_id = ?', jobId) as ArtifactRow[]).map(fromArtifact);
    },
  };
}
