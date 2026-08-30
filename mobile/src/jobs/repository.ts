import type { SQLiteDatabase } from 'expo-sqlite';
import type { JobRecord, JobRepository, ArtifactRecord, JobStatus } from './types';
import type { TaskRecord } from '../tasks/types';

type JobRow = { id: string; workflow_id: string; workflow_version: string; workflow_hash: string; adapter_id: string; adapter_version: string; input_json: string; remote_json?: string; status: string; error_json?: string; created_at: number; updated_at: number };
type ArtifactRow = { id: string; job_id: string; kind: string; uri?: string; mime?: string; metadata_json?: string };

export function createJobRepository(db: SQLiteDatabase | undefined): JobRepository {
  const jobs = new Map<string, JobRecord>();
  const artifacts = new Map<string, ArtifactRecord[]>();
  if (db) {
    db.execSync('CREATE TABLE IF NOT EXISTS workflow_jobs (id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL, workflow_version TEXT NOT NULL, workflow_hash TEXT NOT NULL, adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, input_json TEXT NOT NULL, remote_json TEXT, status TEXT NOT NULL, error_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);');
    db.execSync('CREATE TABLE IF NOT EXISTS workflow_artifacts (id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT, mime TEXT, metadata_json TEXT);');
  }
  const fromJob = (row: JobRow): JobRecord => ({ id: row.id, workflowId: row.workflow_id, workflowVersion: row.workflow_version, workflowContentHash: row.workflow_hash, adapterId: row.adapter_id, adapterVersion: row.adapter_version, inputSnapshot: JSON.parse(row.input_json), remote: row.remote_json ? JSON.parse(row.remote_json) : undefined, status: row.status as JobStatus, error: row.error_json ? JSON.parse(row.error_json) : undefined, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) });
  const fromArtifact = (row: ArtifactRow): ArtifactRecord => ({ id: row.id, jobId: row.job_id, kind: row.kind as ArtifactRecord['kind'], uri: row.uri || undefined, mime: row.mime || undefined, metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined });
  return {
    async upsert(job) {
      if (!db) jobs.set(job.id, job);
      else db.runSync('INSERT OR REPLACE INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,remote_json,status,error_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', job.id, job.workflowId, job.workflowVersion, job.workflowContentHash, job.adapterId, job.adapterVersion, JSON.stringify(job.inputSnapshot), job.remote ? JSON.stringify(job.remote) : null, job.status, job.error ? JSON.stringify(job.error) : null, job.createdAt, job.updatedAt);
    },
    async get(id) {
      if (!db) return jobs.get(id);
      const row = db.getFirstSync<JobRow>('SELECT * FROM workflow_jobs WHERE id = ? LIMIT 1', id) as JobRow | null;
      return row ? fromJob(row) : undefined;
    },
    async list() {
      if (!db) return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
      return (db.getAllSync<JobRow>('SELECT * FROM workflow_jobs ORDER BY created_at DESC') as JobRow[]).map(fromJob);
    },
    async replaceArtifacts(jobId, values) {
      if (!db) { artifacts.set(jobId, values); return; }
      db.runSync('DELETE FROM workflow_artifacts WHERE job_id = ?', jobId);
      for (const value of values) db.runSync('INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)', value.id, jobId, value.kind, value.uri ?? null, value.mime ?? null, value.metadata ? JSON.stringify(value.metadata) : null);
    },
    async listArtifacts(jobId) {
      if (!db) return artifacts.get(jobId) ?? [];
      return (db.getAllSync<ArtifactRow>('SELECT * FROM workflow_artifacts WHERE job_id = ?', jobId) as ArtifactRow[]).map(fromArtifact);
    },
  };
}

function status(value: TaskRecord['status']): JobStatus { return value === 'SUCCESS' ? 'SUCCEEDED' : value === 'FAILED' ? 'FAILED' : value === 'CANCELLED' ? 'CANCELLED' : value === 'RUNNING' ? 'RUNNING' : 'QUEUED'; }
export function taskRecordToJobRecord(task: TaskRecord): JobRecord { return { id: task.id, workflowId: 'legacy-h3', workflowVersion: 'legacy', workflowContentHash: '', adapterId: 'autodl-comfyui', adapterVersion: 'legacy', inputSnapshot: { prompt: task.prompt, resolution: task.resolution, duration: task.duration, seed: task.seed, images: task.images, audios: task.audios }, status: status(task.status), remote: { providerJobId: task.id }, createdAt: task.createdAt, updatedAt: task.updatedAt }; }
export function jobRecordToTaskProjection(job: JobRecord, values: ArtifactRecord[] = []): TaskRecord { const input = job.inputSnapshot; const video = values.find((item) => item.kind === 'video'); return { id: job.id, prompt: String(input.prompt ?? ''), resolution: String(input.resolution ?? ''), duration: Number(input.duration ?? 0), seed: typeof input.seed === 'string' ? input.seed : undefined, images: input.images as TaskRecord['images'], audios: input.audios as TaskRecord['audios'], workflowId: job.workflowId, workflowVersion: job.workflowVersion, workflowContentHash: job.workflowContentHash, adapterId: job.adapterId, adapterVersion: job.adapterVersion, inputSnapshot: input, status: job.status === 'SUCCEEDED' ? 'SUCCESS' : job.status === 'FAILED' ? 'FAILED' : job.status === 'CANCELLED' ? 'CANCELLED' : job.status === 'RUNNING' ? 'RUNNING' : 'QUEUED', videoUrl: video?.uri, createdAt: job.createdAt, updatedAt: job.updatedAt }; }
