import { withWriteTransaction } from '../../storage/sqliteBusy';
import * as FileSystem from 'expo-file-system/legacy';
import type { ArtifactRecord, NormalizedError } from '../../jobs/types';
import type { ArtifactCas, ArtifactBlob } from '../../media/cas';
import { cancelArtifactTransfer, transferArtifact } from '../../native/media';
import type { OperationRepository } from './operationRepository';
import type { WorkflowOperation } from './types';
import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritableAsync } from '../../storage/database';
import { artifactExportDisplayName } from '../../media/artifactDisplayName';
export { artifactExportDisplayName } from '../../media/artifactDisplayName';
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
  transferArtifact?: typeof transferArtifact;
  cancelArtifactTransfer?: typeof cancelArtifactTransfer;
  policy(jobId: string, artifact: ArtifactRecord): ArtifactPolicy | Promise<ArtifactPolicy>;
  ensureProjection(jobId: string, artifact: ArtifactRecord): Promise<void>;
  updateDownloadState(state: 'ENQUEUED' | 'DOWNLOADING' | 'DOWNLOAD_FAILED', errorCode?: string): Promise<void>;
  deliveryPolicy: { autoExportToGallery: boolean; keepPrivateCopy: boolean };
  updateProjection(input: { jobId: string; artifactId: string; localUri: string; mime: string; sha256: string; byteSize: number }): Promise<void> | void;
  verifyVideo(source: string): Promise<unknown>;
  resolveUri?: (relativePath: string) => string;
  commit?: ArtifactCommitter;
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

export type ArtifactReservationInput = {
  operationId: string;
  owner: string;
  blob: ArtifactBlob;
  now: number;
};

export type ArtifactCommitter = {
  (input: ArtifactCommitInput): Promise<void> | void;
  clearStale(input: { operationId: string; owner: string }): Promise<void> | void;
  reserve(input: ArtifactReservationInput): Promise<void> | void;
  release(input: { operationId: string; owner: string }): Promise<void> | void;
};

function reservationOwnerType(operationId: string): string {
  return `artifact_operation:${operationId}`;
}

async function transaction(db: SQLiteDatabase, work: (transaction: SQLiteDatabase) => Promise<void>): Promise<void> {
  await withWriteTransaction(db, work);
}


export function createSqliteArtifactCommitter(db: SQLiteDatabase, clock: () => number = Date.now): ArtifactCommitter {
  const assertGcIdle = async (transaction: SQLiteDatabase) => {
    const gcLease = await transaction.getFirstAsync<{ expires_at: number }>(
      "SELECT expires_at FROM app_scheduler_leases WHERE lease_key='cas-gc' LIMIT 1",
    );
    if (gcLease && Number(gcLease.expires_at) > clock()) throw new ArtifactOperationError('ARTIFACT_CAS_BUSY', 'CAS_GC_IN_PROGRESS', true);
  };
  const commit = async (input: ArtifactCommitInput): Promise<void> => {
    await assertAppDatabaseWritableAsync(db);
    await transaction(db, async (transaction) => {
      await assertGcIdle(transaction);
      await transaction.runAsync(
        'INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET verified_at=MAX(artifact_blobs.verified_at, excluded.verified_at)',
        input.blob.sha256, input.blob.byteSize, input.blob.mime, input.blob.relativePath, input.blob.createdAt, input.blob.verifiedAt,
      );
      await transaction.runAsync('INSERT OR IGNORE INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)', input.blob.sha256, 'workflow_artifact', `${input.jobId}:${input.artifact.id}`, input.now);
      await transaction.runAsync('DELETE FROM artifact_blob_refs WHERE blob_sha256=? AND owner_type=? AND owner_id=?', input.blob.sha256, reservationOwnerType(input.operationId), input.owner);
      const automaticIntent = input.artifact.kind === 'video' && input.deliveryPolicy.autoExportToGallery
        ? { target: 'system-gallery' as const, keepPrivateCopy: input.deliveryPolicy.keepPrivateCopy }
        : undefined;
      const deliveryIntent = input.deliveryIntent ?? automaticIntent;
      const exportStatus = deliveryIntent ? 'QUEUED' : 'NOT_REQUESTED';
      const assetResult = await transaction.runAsync("UPDATE media_assets SET local_path = ?, mime_type = ?, status = 'downloaded', export_status = ?, updated_at = ? WHERE job_id = ? AND artifact_id = ?", input.localUri, input.blob.mime, exportStatus, input.now, input.jobId, input.artifact.id);
      if (Number(assetResult.changes ?? 0) !== 1) throw new Error('media asset projection missing');
      if (input.artifact.kind === 'video') {
        const taskResult = await transaction.runAsync("UPDATE tasks SET local_uri = ?, download_state = 'DOWNLOADED', download_error = NULL, download_progress = 1, export_state = ?, export_error = NULL, updated_at = MAX(updated_at, ?) WHERE id = ?", input.localUri, exportStatus, input.now, input.jobId);
        if (Number(taskResult.changes ?? 0) !== 1) throw new Error('task projection missing');
      }
      if (deliveryIntent) {
        const assetId = `${input.jobId}:${input.artifact.id}`;
        const exportId = `${input.jobId}:export:${input.artifact.id}:system-gallery`;
        await transaction.runAsync(
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
      const result = await transaction.runAsync("UPDATE workflow_operations SET state = 'SUCCEEDED', lease_owner = NULL, lease_expires_at = NULL, last_error_json = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?", input.now, input.operationId, input.owner);
      if (Number(result.changes ?? 0) !== 1) throw new Error('artifact operation lease lost');
    });
  };
  return Object.assign(commit, {
    async clearStale(input: { operationId: string; owner: string }): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await transaction(db, async (transaction) => {
        const claim = await transaction.getFirstAsync<{ present: number }>(
          "SELECT 1 AS present FROM workflow_operations WHERE id=? AND state='CLAIMED' AND lease_owner=? LIMIT 1",
          input.operationId, input.owner,
        );
        if (!claim) throw new Error('artifact operation lease lost');
        await transaction.runAsync('DELETE FROM artifact_blob_refs WHERE owner_type=?', reservationOwnerType(input.operationId));
      });
    },
    async reserve(input: ArtifactReservationInput): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await transaction(db, async (transaction) => {
        await assertGcIdle(transaction);
        const claim = await transaction.getFirstAsync<{ present: number }>(
          "SELECT 1 AS present FROM workflow_operations WHERE id=? AND state='CLAIMED' AND lease_owner=? LIMIT 1",
          input.operationId, input.owner,
        );
        if (!claim) throw new Error('artifact operation lease lost');
        const ownerType = reservationOwnerType(input.operationId);
        await transaction.runAsync('DELETE FROM artifact_blob_refs WHERE owner_type=?', ownerType);
        await transaction.runAsync(
          'INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET verified_at=MAX(artifact_blobs.verified_at, excluded.verified_at)',
          input.blob.sha256, input.blob.byteSize, input.blob.mime, input.blob.relativePath, input.blob.createdAt, input.blob.verifiedAt,
        );
        await transaction.runAsync(
          'INSERT OR IGNORE INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)',
          input.blob.sha256, ownerType, input.owner, input.now,
        );
      });
    },
    async release(input: { operationId: string; owner: string }): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await transaction(db, async (transaction) => {
        await transaction.runAsync(
          'DELETE FROM artifact_blob_refs WHERE owner_type=? AND owner_id=?',
          reservationOwnerType(input.operationId), input.owner,
        );
      });
    },
  });
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

function canonicalNativeTransferCause(cause: unknown): unknown {
  if (!cause || typeof cause !== 'object') return cause;
  const code = (cause as { code?: unknown }).code;
  if (code === 'ARTIFACT_SHA_MISMATCH' || code === 'ARTIFACT_DURABLE_SHA_MISMATCH' ||
      code === 'ARTIFACT_TRANSFER_INVALID' || code === 'ARTIFACT_TRANSFER_REQUEST_INVALID') {
    return { code: 'ARTIFACT_INTEGRITY_FAILED' };
  }
  return cause;
}

type LeaseHeartbeatOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'lease-lost'; value: T; cause: unknown };

function withLeaseHeartbeat<T>(options: {
  work(): Promise<T>;
  assertLease(): Promise<void>;
  onLeaseLost(): Promise<void>;
  leaseMs: number;
}): Promise<LeaseHeartbeatOutcome<T>> {
  return new Promise<LeaseHeartbeatOutcome<T>>((resolve, reject) => {
    let leaseLoss: { cause: unknown; cancellation: Promise<void> } | undefined;
    let pendingLeaseCheck: Promise<void> | undefined;
    const intervalMs = Math.max(1, Math.min(30_000, Math.floor(options.leaseMs / 3)));
    const recordLeaseLoss = (cause: unknown) => {
      if (!leaseLoss) {
        clearInterval(timer);
        const cancellation = Promise.resolve().then(options.onLeaseLost).then(
          () => undefined,
          () => undefined,
        );
        leaseLoss = { cause, cancellation };
      }
    };
    const timer = setInterval(() => {
      if (leaseLoss || pendingLeaseCheck) return;
      const check = options.assertLease().catch(recordLeaseLoss).finally(() => {
        if (pendingLeaseCheck === check) pendingLeaseCheck = undefined;
      });
      pendingLeaseCheck = check;
    }, intervalMs);
    void Promise.resolve().then(options.work).then(async (value) => {
      clearInterval(timer);
      await pendingLeaseCheck;
      if (!leaseLoss) {
        resolve({ status: 'completed', value });
        return;
      }
      await leaseLoss.cancellation;
      resolve({ status: 'lease-lost', value, cause: leaseLoss.cause });
    }, async (cause) => {
      clearInterval(timer);
      await pendingLeaseCheck;
      if (leaseLoss) {
        await leaseLoss.cancellation;
        reject(leaseLoss.cause);
        return;
      }
      reject(cause);
    });
  });
}

export async function handleArtifactDownload(operation: WorkflowOperation, owner: string, deps: ArtifactOperationDeps): Promise<void> {
  const clock = deps.now ?? Date.now;
  const timestamp = clock();
  const payload = payloadFrom(operation);
  const artifact = payload?.artifact;
  const url = artifact?.uri?.trim();
  if (!operation.jobId || !artifact || !url) {
    await deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalized('ARTIFACT_INPUT_INVALID', false));
    return;
  }
  let staged: Awaited<ReturnType<ArtifactCas['adoptNativePart']>> | undefined;
  let reservation: { operationId: string; owner: string } | undefined;
  try {
    if (deps.commit) await deps.commit.clearStale({ operationId: operation.id, owner });
    await deps.ensureProjection(operation.jobId, artifact);
    await deps.updateDownloadState('DOWNLOADING');
    const policy = await deps.policy(operation.jobId, artifact);
    const assertLease = async () => {
      if (!await deps.operations.renew(operation.id, owner, clock(), deps.leaseMs ?? 120_000)) {
        throw new Error('artifact operation lease lost');
      }
    };
    const providerSha256 = typeof artifact.metadata?.sha256 === 'string' && artifact.metadata.sha256.trim()
      ? artifact.metadata.sha256.trim()
      : undefined;
    await assertLease();
    const transferOutcome = await withLeaseHeartbeat({
      leaseMs: deps.leaseMs ?? 120_000,
      assertLease,
      onLeaseLost: async () => {
        await (deps.cancelArtifactTransfer ?? cancelArtifactTransfer)(operation.id, operation.attempt);
      },
      work: () => (deps.transferArtifact ?? transferArtifact)({
        url,
        allowedHosts: policy.allowedHosts,
        allowProviderSuppliedPublicHosts: policy.allowProviderSuppliedPublicHosts ?? false,
        maxBytes: policy.maxBytes,
        acceptedMimes: policy.acceptedMimes ?? ['video/mp4'],
        connectTimeoutMs: policy.connectTimeoutMs ?? 30_000,
        idleTimeoutMs: policy.idleTimeoutMs ?? 30_000,
        expectedSha256: providerSha256?.toLowerCase(),
        operationId: operation.id,
        operationAttempt: operation.attempt,
      }),
    });
    const transferred = transferOutcome.value;
    const adoptionOptions = {
      mime: transferred.mime,
      maxBytes: policy.maxBytes,
      expectedSha256: providerSha256,
      operationId: operation.id,
      operationAttempt: operation.attempt,
    };
    if (transferOutcome.status === 'lease-lost') {
      try {
        const abandoned = await deps.cas.adoptNativePart(transferred, adoptionOptions);
        await abandoned.abort();
      } catch { /* adoption deletes only the validated owned attempt part on failure */ }
      throw transferOutcome.cause;
    }
    staged = await deps.cas.adoptNativePart(transferred, {
      ...adoptionOptions,
      assertLease,
    });
    const resolveUri = deps.resolveUri ?? ((relativePath: string) => `${FileSystem.documentDirectory ?? ''}${relativePath}`);
    if (artifact.kind === 'video') {
      try {
        await deps.verifyVideo(resolveUri(staged.stagedRelativePath));
      } catch (cause) {
        const failure = classifyMediaValidationFailure(operation.attempt);
        throw new ArtifactOperationError(failure.code, mediaValidationMessage(failure.code), failure.retryable, { cause });
      }
    }
    if (deps.commit) {
      const blob = { ...staged, createdAt: timestamp, verifiedAt: timestamp };
      await deps.commit.reserve({ operationId: operation.id, owner, blob, now: timestamp });
      reservation = { operationId: operation.id, owner };
    }
    const stored = await staged.publish();
    const blob: ArtifactBlob = { ...stored, createdAt: timestamp, verifiedAt: timestamp };
    const localUri = resolveUri(blob.relativePath);
    if (deps.commit) {
      const latestPayload = payloadFrom((await deps.operations.get(operation.id)) ?? operation);
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
      reservation = undefined;
    } else {
      deps.blobs.upsertBlob(blob);
      deps.blobs.retain(blob.sha256, 'workflow_artifact', `${operation.jobId}:${artifact.id}`, timestamp);
      await deps.updateProjection({ jobId: operation.jobId, artifactId: artifact.id, localUri, mime: blob.mime, sha256: blob.sha256, byteSize: blob.byteSize });
      await deps.operations.finish(operation.id, owner, 'SUCCEEDED', timestamp);
    }
  } catch (cause) {
    await staged?.abort().catch(() => undefined);
    if (reservation && deps.commit) {
      await Promise.resolve(deps.commit.release(reservation)).catch(() => undefined);
    }
    const failure = artifactError(canonicalNativeTransferCause(cause));
    const normalizedFailure = normalized(failure.code, failure.retryable);
    if (failure.retryable) {
      const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
      await deps.updateDownloadState('ENQUEUED', failure.code);
      await deps.operations.retry(operation.id, owner, { now: timestamp, nextRetryAt, error: normalizedFailure });
      return;
    }
    try { await deps.updateDownloadState('DOWNLOAD_FAILED', failure.code); } catch { /* operation failure remains authoritative */ }
    await deps.operations.finish(operation.id, owner, 'FAILED', timestamp, normalizedFailure);
  }
}
