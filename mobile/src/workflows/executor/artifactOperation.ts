import * as FileSystem from 'expo-file-system/legacy';
import type { ArtifactRecord, NormalizedError } from '../../jobs/types';
import type { ArtifactCas, ArtifactBlob } from '../../media/cas';
import { openArtifactDownload } from '../../tasks/downloadPolicy';
import type { OperationRepository } from './operationRepository';
import type { WorkflowOperation } from './types';
import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritable } from '../../storage/database';
import CryptoJS from 'crypto-js';
import { ArtifactOperationError, artifactError } from './artifactErrors';
import { classifyMediaValidationFailure, mediaValidationMessage } from '../../media/mediaValidation';

type ArtifactPolicy = {
  allowedHosts: string[];
  allowProviderSuppliedPublicHosts?: boolean;
  maxBytes: number;
  acceptedMimes?: string[];
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
};

export type SystemGalleryIntent = { target: 'system-gallery'; keepPrivateCopy: boolean };
export type ArtifactDownloadPayload = { artifact: ArtifactRecord; deliveryIntent?: SystemGalleryIntent };

type ArtifactOperationDeps = {
  operations: Pick<OperationRepository, 'get' | 'retry' | 'finish' | 'renew'>;
  blobs: { upsertBlob(blob: ArtifactBlob): void; retain(sha256: string, ownerType: string, ownerId: string, now: number): void };
  cas: ArtifactCas;
  openDownload?: typeof openArtifactDownload;
  policy(jobId: string, artifact: ArtifactRecord): ArtifactPolicy;
  ensureProjection(jobId: string, artifact: ArtifactRecord): Promise<void>;
  updateDownloadState(state: 'ENQUEUED' | 'DOWNLOADING' | 'DOWNLOAD_FAILED', errorCode?: string): Promise<void>;
  deliveryPolicy: { autoExportToGallery: boolean; keepPrivateCopy: boolean };
  updateProjection(input: { jobId: string; artifactId: string; localUri: string; mime: string; sha256: string; byteSize: number }): Promise<void> | void;
  verifyVideo(source: string): Promise<unknown>;
  resolveUri?: (relativePath: string) => string;
  commit?: (input: ArtifactCommitInput) => Promise<void> | void;
  now?: () => number;
  leaseMs?: number;
};

export type ArtifactCommitInput = {
  operationId: string;
  owner: string;
  jobId: string;
  artifact: ArtifactRecord;
  blob: ArtifactBlob;
  localUri: string;
  now: number;
  deliveryPolicy: { autoExportToGallery: boolean; keepPrivateCopy: boolean };
  deliveryIntent?: SystemGalleryIntent;
};

function transaction(db: SQLiteDatabase, work: () => void): void {
  if (typeof db.withTransactionSync === 'function') { db.withTransactionSync(work); return; }
  db.execSync('BEGIN IMMEDIATE');
  try { work(); db.execSync('COMMIT'); } catch (error) { try { db.execSync('ROLLBACK'); } catch { /* best effort */ } throw error; }
}

export function artifactExportDisplayName(jobId: string, artifactId: string): string {
  const safeJobId = jobId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[_\.]+|[_\.]+$/g, '').slice(0, 48) || 'job';
  const identity = CryptoJS.SHA256(`${jobId}\u0000${artifactId}`).toString(CryptoJS.enc.Hex).slice(0, 16);
  return `${safeJobId}-${identity}.mp4`;
}

export function createSqliteArtifactCommitter(db: SQLiteDatabase, clock: () => number = Date.now) {
  return (input: ArtifactCommitInput): void => {
    assertAppDatabaseWritable(db);
    transaction(db, () => {
      const gcLease = db.getFirstSync<{ expires_at: number }>(
        "SELECT expires_at FROM app_scheduler_leases WHERE lease_key='cas-gc' LIMIT 1",
      );
      if (gcLease && Number(gcLease.expires_at) > clock()) throw new ArtifactOperationError('ARTIFACT_CAS_BUSY', 'CAS_GC_IN_PROGRESS', true);
      db.runSync(
        'INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET verified_at=MAX(artifact_blobs.verified_at, excluded.verified_at)',
        input.blob.sha256, input.blob.byteSize, input.blob.mime, input.blob.relativePath, input.blob.createdAt, input.blob.verifiedAt,
      );
      db.runSync('INSERT OR IGNORE INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)', input.blob.sha256, 'workflow_artifact', `${input.jobId}:${input.artifact.id}`, input.now);
      const automaticIntent = input.artifact.kind === 'video' && input.deliveryPolicy.autoExportToGallery
        ? { target: 'system-gallery' as const, keepPrivateCopy: input.deliveryPolicy.keepPrivateCopy }
        : undefined;
      const deliveryIntent = input.deliveryIntent ?? automaticIntent;
      const exportStatus = deliveryIntent ? 'QUEUED' : 'NOT_REQUESTED';
      const assetResult = db.runSync("UPDATE media_assets SET local_path = ?, mime_type = ?, status = 'downloaded', export_status = ?, updated_at = ? WHERE job_id = ? AND artifact_id = ?", input.localUri, input.blob.mime, exportStatus, input.now, input.jobId, input.artifact.id) as { changes?: number | bigint };
      if (Number(assetResult.changes ?? 0) !== 1) throw new Error('media asset projection missing');
      if (input.artifact.kind === 'video') {
        const taskResult = db.runSync("UPDATE tasks SET local_uri = ?, download_state = 'DOWNLOADED', download_error = NULL, download_progress = 1, export_state = ?, export_error = NULL, updated_at = MAX(updated_at, ?) WHERE id = ?", input.localUri, exportStatus, input.now, input.jobId) as { changes?: number | bigint };
        if (Number(taskResult.changes ?? 0) !== 1) throw new Error('task projection missing');
      }
      if (deliveryIntent) {
        const assetId = `${input.jobId}:${input.artifact.id}`;
        const exportId = `${input.jobId}:export:${input.artifact.id}:system-gallery`;
        db.runSync(
          "INSERT OR IGNORE INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,'EXPORT',?,?,?,'PENDING',0,?,?,?)",
          exportId,
          input.jobId,
          `export:${input.jobId}:${input.artifact.id}:system-gallery`,
          JSON.stringify({
            assetId,
            artifactId: input.artifact.id,
            sourceUri: input.localUri,
            sourceKind: 'cas',
            blobSha256: input.blob.sha256,
            keepPrivateCopy: deliveryIntent.keepPrivateCopy,
            displayName: artifactExportDisplayName(input.jobId, input.artifact.id),
          }),
          input.now,
          input.now,
          input.now,
        );
      }
      const result = db.runSync("UPDATE workflow_operations SET state = 'SUCCEEDED', lease_owner = NULL, lease_expires_at = NULL, last_error_json = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?", input.now, input.operationId, input.owner) as { changes?: number | bigint };
      if (Number(result.changes ?? 0) !== 1) throw new Error('artifact operation lease lost');
    });
  };
}

function payloadFrom(operation: WorkflowOperation): ArtifactDownloadPayload | undefined {
  const value = operation.payload.artifact;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const artifact = value as Partial<ArtifactRecord>;
  if (typeof artifact.id !== 'string' || typeof artifact.kind !== 'string') return undefined;
  const delivery = operation.payload.deliveryIntent;
  if (delivery != null) {
    if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) return undefined;
    const candidate = delivery as Partial<SystemGalleryIntent>;
    if (candidate.target !== 'system-gallery' || typeof candidate.keepPrivateCopy !== 'boolean') return undefined;
    return { artifact: artifact as ArtifactRecord, deliveryIntent: candidate as SystemGalleryIntent };
  }
  return { artifact: artifact as ArtifactRecord };
}

function normalized(code: string, retryable: boolean): NormalizedError {
  if (code === 'ARTIFACT_MEDIA_INVALID_RETRYABLE' || code === 'ARTIFACT_MEDIA_INVALID') {
    return { code, message: mediaValidationMessage(code), retryable };
  }
  return { code, message: retryable ? 'Artifact transfer will be retried.' : 'Artifact transfer failed policy or integrity validation.', retryable };
}

export async function handleArtifactDownload(operation: WorkflowOperation, owner: string, deps: ArtifactOperationDeps): Promise<void> {
  const clock = deps.now ?? Date.now;
  const timestamp = clock();
  const payload = payloadFrom(operation);
  const artifact = payload?.artifact;
  const url = artifact?.uri?.trim();
  if (!operation.jobId || !artifact || !url) {
    deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalized('ARTIFACT_INPUT_INVALID', false));
    return;
  }
  try {
    await deps.ensureProjection(operation.jobId, artifact);
    await deps.updateDownloadState('DOWNLOADING');
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
      operationAttempt: operation.attempt,
      assertLease: () => {
        if (!deps.operations.renew(operation.id, owner, clock(), deps.leaseMs ?? 120_000)) {
          throw new Error('artifact operation lease lost');
        }
      },
    });
    const blob: ArtifactBlob = { ...stored, createdAt: timestamp, verifiedAt: timestamp };
    const resolveUri = deps.resolveUri ?? ((relativePath: string) => `${FileSystem.documentDirectory ?? ''}${relativePath}`);
    const localUri = resolveUri(blob.relativePath);
    if (artifact.kind === 'video') {
      try {
        await deps.verifyVideo(localUri);
      } catch (cause) {
        const failure = classifyMediaValidationFailure(operation.attempt);
        throw new ArtifactOperationError(failure.code, mediaValidationMessage(failure.code), failure.retryable, { cause });
      }
    }
    if (deps.commit) {
      const latestPayload = payloadFrom(deps.operations.get(operation.id) ?? operation);
      await deps.commit({
        operationId: operation.id,
        owner,
        jobId: operation.jobId,
        artifact,
        blob,
        localUri,
        now: timestamp,
        deliveryPolicy: deps.deliveryPolicy,
        deliveryIntent: latestPayload?.deliveryIntent ?? payload.deliveryIntent,
      });
    } else {
      deps.blobs.upsertBlob(blob);
      deps.blobs.retain(blob.sha256, 'workflow_artifact', `${operation.jobId}:${artifact.id}`, timestamp);
      await deps.updateProjection({ jobId: operation.jobId, artifactId: artifact.id, localUri, mime: blob.mime, sha256: blob.sha256, byteSize: blob.byteSize });
      deps.operations.finish(operation.id, owner, 'SUCCEEDED', timestamp);
    }
  } catch (cause) {
    const failure = artifactError(cause);
    const normalizedFailure = normalized(failure.code, failure.retryable);
    if (failure.retryable) {
      const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
      await deps.updateDownloadState('ENQUEUED', failure.code);
      deps.operations.retry(operation.id, owner, { now: timestamp, nextRetryAt, error: normalizedFailure });
      return;
    }
    try { await deps.updateDownloadState('DOWNLOAD_FAILED', failure.code); } catch { /* operation failure remains authoritative */ }
    deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalizedFailure);
  }
}
