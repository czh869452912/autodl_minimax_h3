import type { SQLiteDatabase } from 'expo-sqlite';
import type { JobRecord, JobRepository, ArtifactRecord, JobStatus } from './types';
import type { TaskRecord } from '../tasks/types';

type JobRow = { id: string; workflow_id: string; workflow_version: string; workflow_hash: string; adapter_id: string; adapter_version: string; input_json: string; remote_json?: string; status: string; error_json?: string; created_at: number; updated_at: number; started_at?: number; execution_duration?: number };
type ArtifactRow = { id: string; job_id: string; kind: string; uri?: string; mime?: string; metadata_json?: string };

export function createJobRepository(db: SQLiteDatabase | undefined): JobRepository {
  const jobs = new Map<string, JobRecord>();
  const artifacts = new Map<string, ArtifactRecord[]>();
  const database = db && typeof (db as unknown as { execSync?: unknown }).execSync === 'function' ? db : undefined;
  if (database) {
    database.execSync('CREATE TABLE IF NOT EXISTS workflow_jobs (id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL, workflow_version TEXT NOT NULL, workflow_hash TEXT NOT NULL, adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, input_json TEXT NOT NULL, remote_json TEXT, status TEXT NOT NULL, error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, execution_duration REAL);');
    for (const statement of ['ALTER TABLE workflow_jobs ADD COLUMN started_at INTEGER', 'ALTER TABLE workflow_jobs ADD COLUMN execution_duration REAL']) { try { database.execSync(statement); } catch {} }
    database.execSync('CREATE TABLE IF NOT EXISTS workflow_artifacts (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT, mime TEXT, metadata_json TEXT);');
  }
  const fromJob = (row: JobRow): JobRecord => ({ id: row.id, workflowId: row.workflow_id, workflowVersion: row.workflow_version, workflowContentHash: row.workflow_hash, adapterId: row.adapter_id, adapterVersion: row.adapter_version, inputSnapshot: JSON.parse(row.input_json), remote: row.remote_json ? JSON.parse(row.remote_json) : undefined, status: row.status as JobStatus, error: row.error_json ? JSON.parse(row.error_json) : undefined, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), startedAt: row.started_at == null ? undefined : Number(row.started_at), executionDuration: row.execution_duration == null ? undefined : Number(row.execution_duration) });
  const fromArtifact = (row: ArtifactRow): ArtifactRecord => ({ id: row.id, jobId: row.job_id, kind: row.kind as ArtifactRecord['kind'], uri: row.uri || undefined, mime: row.mime || undefined, metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined });
  return {
    async upsert(job) {
      if (!database) jobs.set(job.id, job);
      else database.runSync('INSERT OR REPLACE INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,remote_json,status,error_json,created_at,updated_at,started_at,execution_duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', job.id, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion, JSON.stringify(job.inputSnapshot), job.remote ? JSON.stringify(job.remote) : null, job.status, job.error ? JSON.stringify(job.error) : null, job.createdAt, job.updatedAt, job.startedAt ?? null, job.executionDuration ?? null);
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
      database.runSync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
      for (const value of values) database.runSync('INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)', value.id, jobId, value.kind, value.uri ?? null, value.mime ?? null, value.metadata ? JSON.stringify(value.metadata) : null);
    },
    async listArtifacts(jobId) {
      if (!database) return artifacts.get(jobId) ?? [];
      return (database.getAllSync<ArtifactRow>('SELECT * FROM workflow_artifacts WHERE job_id = ?', jobId) as ArtifactRow[]).map(fromArtifact);
    },
  };
}

function status(value: TaskRecord['status']): JobStatus { return value === 'SUCCESS' ? 'SUCCEEDED' : value === 'FAILED' ? 'FAILED' : value === 'CANCELLED' ? 'CANCELLED' : value === 'RUNNING' ? 'RUNNING' : 'QUEUED'; }
export function taskRecordToJobRecord(task: TaskRecord): JobRecord { return { id: task.id, workflowId: 'legacy-h3', workflowVersion: 'legacy', workflowContentHash: '', adapterId: 'autodl-comfyui', adapterVersion: 'legacy', inputSnapshot: { prompt: task.prompt, resolution: task.resolution, duration: task.duration, seed: task.seed, images: task.images, audios: task.audios }, status: status(task.status), remote: { providerJobId: task.id }, createdAt: task.createdAt, updatedAt: task.updatedAt }; }
export function jobRecordToTaskProjection(job: JobRecord, values: ArtifactRecord[] = [], previous?: TaskRecord): TaskRecord { const input = job.inputSnapshot; const video = values.find((item) => item.kind === 'video'); const mappedStatus: TaskRecord['status'] = job.status === 'SUCCEEDED' ? 'SUCCESS' : job.status === 'PARTIAL_SUCCEEDED' ? 'PARTIAL_SUCCESS' : job.status === 'FAILED' ? 'FAILED' : job.status === 'CANCELLED' ? 'CANCELLED' : job.status === 'UNKNOWN' ? 'UNKNOWN' : job.status === 'RUNNING' ? 'RUNNING' : 'QUEUED'; return { ...previous, id: job.id, prompt: String(input.prompt ?? previous?.prompt ?? ''), resolution: String(input.resolution ?? previous?.resolution ?? ''), duration: Number(input.duration ?? previous?.duration ?? 0), seed: typeof input.seed === 'string' ? input.seed : previous?.seed, images: (input.images as TaskRecord['images']) ?? previous?.images, audios: (input.audios as TaskRecord['audios']) ?? previous?.audios, workflowId: job.workflowId, workflowVersion: job.workflowVersion, workflowContentHash: job.workflowContentHash, adapterId: job.adapterId, adapterVersion: job.adapterVersion, inputSnapshot: input, status: mappedStatus, videoUrl: video?.uri ?? previous?.videoUrl, createdAt: job.createdAt, updatedAt: job.updatedAt, startedAt: job.startedAt ?? previous?.startedAt, executionDuration: job.executionDuration ?? previous?.executionDuration, syncError: job.error?.message }; }
