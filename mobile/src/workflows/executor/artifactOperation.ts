import * as FileSystem from 'expo-file-system/legacy';
import type { ArtifactRecord, NormalizedError } from '../../jobs/types';
import type { ArtifactCas, ArtifactBlob } from '../../media/cas';
import { openArtifactDownload } from '../../tasks/downloadPolicy';
import type { OperationRepository } from './operationRepository';
import type { WorkflowOperation } from './types';
import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritable } from '../../storage/database';

type ArtifactPolicy = {
  allowedHosts: string[];
  allowProviderSuppliedPublicHosts?: boolean;
  maxBytes: number;
  acceptedMimes?: string[];
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
};

type ArtifactOperationDeps = {
  operations: Pick<OperationRepository, 'retry' | 'finish'>;
  blobs: { upsertBlob(blob: ArtifactBlob): void; retain(sha256: string, ownerType: string, ownerId: string, now: number): void };
  cas: ArtifactCas;
  openDownload?: typeof openArtifactDownload;
  policy(jobId: string, artifact: ArtifactRecord): ArtifactPolicy;
  updateProjection(input: { jobId: string; artifactId: string; localUri: string; mime: string; sha256: string; byteSize: number }): Promise<void> | void;
  resolveUri?: (relativePath: string) => string;
  commit?: (input: ArtifactCommitInput) => Promise<void> | void;
  now?: () => number;
};

export type ArtifactCommitInput = {
  operationId: string;
  owner: string;
  jobId: string;
  artifact: ArtifactRecord;
  blob: ArtifactBlob;
  localUri: string;
  now: number;
};

function transaction(db: SQLiteDatabase, work: () => void): void {
  if (typeof db.withTransactionSync === 'function') { db.withTransactionSync(work); return; }
  db.execSync('BEGIN IMMEDIATE');
  try { work(); db.execSync('COMMIT'); } catch (error) { try { db.execSync('ROLLBACK'); } catch { /* best effort */ } throw error; }
}

export function createSqliteArtifactCommitter(db: SQLiteDatabase) {
  return (input: ArtifactCommitInput): void => {
    assertAppDatabaseWritable(db);
    transaction(db, () => {
      db.runSync(
        'INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET verified_at=MAX(artifact_blobs.verified_at, excluded.verified_at)',
        input.blob.sha256, input.blob.byteSize, input.blob.mime, input.blob.relativePath, input.blob.createdAt, input.blob.verifiedAt,
      );
      db.runSync('INSERT OR IGNORE INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)', input.blob.sha256, 'workflow_artifact', `${input.jobId}:${input.artifact.id}`, input.now);
      db.runSync("UPDATE media_assets SET local_path = ?, mime_type = ?, status = 'downloaded', updated_at = ? WHERE job_id = ? AND artifact_id = ?", input.localUri, input.blob.mime, input.now, input.jobId, input.artifact.id);
      if (input.artifact.kind === 'video') db.runSync("UPDATE tasks SET local_uri = ?, download_state = 'DOWNLOADED', download_error = NULL, download_progress = 1, updated_at = MAX(updated_at, ?) WHERE id = ?", input.localUri, input.now, input.jobId);
      const result = db.runSync("UPDATE workflow_operations SET state = 'SUCCEEDED', lease_owner = NULL, lease_expires_at = NULL, last_error_json = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?", input.now, input.operationId, input.owner) as { changes?: number | bigint };
      if (Number(result.changes ?? 0) !== 1) throw new Error('artifact operation lease lost');
    });
  };
}

function artifactFrom(operation: WorkflowOperation): ArtifactRecord | undefined {
  const value = operation.payload.artifact;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const artifact = value as Partial<ArtifactRecord>;
  return typeof artifact.id === 'string' && typeof artifact.kind === 'string' ? artifact as ArtifactRecord : undefined;
}

function normalized(code: string, retryable: boolean): NormalizedError {
  return { code, message: retryable ? 'Artifact transfer will be retried.' : 'Artifact transfer failed policy or integrity validation.', retryable };
}

export async function handleArtifactDownload(operation: WorkflowOperation, owner: string, deps: ArtifactOperationDeps): Promise<void> {
  const timestamp = (deps.now ?? Date.now)();
  const artifact = artifactFrom(operation);
  const url = artifact?.uri?.trim();
  if (!operation.jobId || !artifact || !url) {
    deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalized('ARTIFACT_INPUT_INVALID', false));
    return;
  }
  try {
    const policy = deps.policy(operation.jobId, artifact);
    const opened = await (deps.openDownload ?? openArtifactDownload)(url, {
      allowedHosts: policy.allowedHosts,
      allowProviderSuppliedPublicHosts: policy.allowProviderSuppliedPublicHosts,
      maxBytes: policy.maxBytes,
      acceptedMimes: policy.acceptedMimes,
      connectTimeoutMs: policy.connectTimeoutMs,
      idleTimeoutMs: policy.idleTimeoutMs,
    });
    const stored = await deps.cas.put(opened.stream, {
      mime: opened.mime,
      maxBytes: policy.maxBytes,
      expectedSha256: typeof artifact.metadata?.sha256 === 'string' ? artifact.metadata.sha256 : undefined,
      operationId: operation.id,
    });
    const blob: ArtifactBlob = { ...stored, createdAt: timestamp, verifiedAt: timestamp };
    const resolveUri = deps.resolveUri ?? ((relativePath: string) => `${FileSystem.documentDirectory ?? ''}${relativePath}`);
    const localUri = resolveUri(blob.relativePath);
    if (deps.commit) {
      await deps.commit({ operationId: operation.id, owner, jobId: operation.jobId, artifact, blob, localUri, now: timestamp });
    } else {
      deps.blobs.upsertBlob(blob);
      deps.blobs.retain(blob.sha256, 'workflow_artifact', `${operation.jobId}:${artifact.id}`, timestamp);
      await deps.updateProjection({ jobId: operation.jobId, artifactId: artifact.id, localUri, mime: blob.mime, sha256: blob.sha256, byteSize: blob.byteSize });
      deps.operations.finish(operation.id, owner, 'SUCCEEDED', timestamp);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/连接超时|空闲超时|network|fetch failed/i.test(message)) {
      const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
      deps.operations.retry(operation.id, owner, { now: timestamp, nextRetryAt, error: normalized('ARTIFACT_TRANSFER_RETRY', true) });
      return;
    }
    deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalized('ARTIFACT_VALIDATION_FAILED', false));
  }
}
