import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { NormalizedError } from '../../jobs/types';
import { assertAppDatabaseWritable } from '../../storage/database';
import type { WorkflowOperation } from './types';

export type ExportPayload = {
  assetId: string;
  artifactId: string;
  sourceUri: string;
  sourceKind: 'cas' | 'legacy';
  blobSha256?: string;
  keepPrivateCopy: boolean;
  displayName: string;
};

export type ExportSuccessInput = ExportPayload & {
  operationId: string;
  owner: string;
  jobId: string;
  galleryUri: string;
  referenceOwnerId: string;
  now: number;
};

type ExportFailureInput = { now: number; nextRetryAt?: number; error: NormalizedError };

type ExportDeps = {
  now(): number;
  assertSource(sourceUri: string): Promise<void>;
  markExporting(operation: WorkflowOperation, owner: string, payload: ExportPayload, now: number): Promise<void> | void;
  canPublish?(operation: WorkflowOperation, owner: string, payload: ExportPayload): Promise<boolean> | boolean;
  publish(sourceUri: string, options: { mediaId: string; displayName: string }): Promise<{ uri: string }>;
  afterPublish?(input: { operationId: string; galleryUri: string }): Promise<void> | void;
  commitSuccess(input: ExportSuccessInput): Promise<void> | void;
  retry(operation: WorkflowOperation, owner: string, payload: ExportPayload, input: ExportFailureInput & { nextRetryAt: number }): Promise<void> | void;
  finishFailure(operation: WorkflowOperation, owner: string, payload: ExportPayload | undefined, now: number, error: NormalizedError): Promise<void> | void;
  removeLegacyPrivate?(sourceUri: string): Promise<void>;
};

async function transaction(db: SQLiteDatabase, work: (transaction: SQLiteDatabase) => Promise<void>): Promise<void> {
  await db.withExclusiveTransactionAsync(work);
}

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

function payloadFrom(operation: WorkflowOperation): ExportPayload | undefined {
  const value = operation.payload as Partial<ExportPayload>;
  const validSource = (value.sourceKind === 'cas' && typeof value.blobSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.blobSha256))
    || (value.sourceKind === 'legacy' && value.blobSha256 == null);
  return typeof value.assetId === 'string'
    && typeof value.artifactId === 'string'
    && typeof value.sourceUri === 'string'
    && validSource
    && typeof value.keepPrivateCopy === 'boolean'
    && typeof value.displayName === 'string'
    ? value as ExportPayload
    : undefined;
}

function failure(code: 'EXPORT_SOURCE_MISSING' | 'EXPORT_NATIVE_RETRY' | 'EXPORT_NATIVE_FAILED', retryable = false): NormalizedError {
  return {
    code,
    message: retryable ? 'System gallery export will be retried.' : 'System gallery export failed.',
    ...(retryable ? { retryable: true } : {}),
  };
}

function transientNativeFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /temporar|unavailable|busy|timeout|timed out|i\/o|io error|network|暂时|繁忙|稍后重试/i.test(message);
}

export async function assertLocalExportSource(sourceUri: string): Promise<void> {
  if (!sourceUri.startsWith('file://')) throw new Error('export source is not private file');
  const info = await FileSystem.getInfoAsync(sourceUri);
  if (!info.exists || info.isDirectory) throw new Error('export source is missing');
}

export async function handleExport(operation: WorkflowOperation, owner: string, deps: ExportDeps): Promise<void> {
  const timestamp = deps.now();
  const payload = payloadFrom(operation);
  if (!operation.jobId || !payload) {
    await deps.finishFailure(operation, owner, payload, timestamp, failure('EXPORT_NATIVE_FAILED'));
    return;
  }
  try {
    await deps.assertSource(payload.sourceUri);
  } catch {
    await deps.finishFailure(operation, owner, payload, timestamp, failure('EXPORT_SOURCE_MISSING'));
    return;
  }

  await deps.markExporting(operation, owner, payload, timestamp);
  if (deps.canPublish && !await deps.canPublish(operation, owner, payload)) return;
  let result: { uri: string };
  try {
    result = await deps.publish(payload.sourceUri, { mediaId: payload.assetId, displayName: payload.displayName });
  } catch (cause) {
    if (transientNativeFailure(cause)) {
      const retryError = failure('EXPORT_NATIVE_RETRY', true);
      const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
      await deps.retry(operation, owner, payload, { now: timestamp, nextRetryAt, error: retryError });
      return;
    }
    await deps.finishFailure(operation, owner, payload, timestamp, failure('EXPORT_NATIVE_FAILED'));
    return;
  }

  await deps.afterPublish?.({ operationId: operation.id, galleryUri: result.uri });
  try {
    await deps.commitSuccess({
      operationId: operation.id,
      owner,
      jobId: operation.jobId,
      ...payload,
      galleryUri: result.uri,
      referenceOwnerId: `${operation.jobId}:${payload.artifactId}`,
      now: deps.now(),
    });
    if (!payload.keepPrivateCopy && payload.sourceKind === 'legacy'
      && payload.sourceUri.startsWith('file://') && !payload.sourceUri.includes('/cas/sha256/')
      && deps.removeLegacyPrivate) {
      await deps.removeLegacyPrivate(payload.sourceUri).catch(() => undefined);
    }
  } catch (cause) {
    if (transientNativeFailure(cause)) {
      const retryError = failure('EXPORT_NATIVE_RETRY', true);
      const nextRetryAt = timestamp + Math.min(60_000, 1_000 * (2 ** Math.max(0, operation.attempt - 1)));
      await deps.retry(operation, owner, payload, { now: timestamp, nextRetryAt, error: retryError });
      return;
    }
    await deps.finishFailure(operation, owner, payload, timestamp, failure('EXPORT_NATIVE_FAILED'));
  }
}

export function createSqliteExportStore(db: SQLiteDatabase) {
  const deliveryId = (payload: ExportPayload) => `${payload.assetId}:system-gallery`;
  return {
    async canPublish(operation: WorkflowOperation, owner: string, payload: ExportPayload): Promise<boolean> {
      return Boolean(await db.getFirstAsync(
        "SELECT 1 AS present FROM workflow_operations o WHERE o.id=? AND o.state='CLAIMED' AND o.lease_owner=? AND EXISTS (SELECT 1 FROM tasks t WHERE t.id=o.job_id) AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id=? AND m.task_id=o.job_id) LIMIT 1",
        operation.id, owner, payload.assetId,
      ));
    },
    async markExporting(operation: WorkflowOperation, owner: string, payload: ExportPayload, now: number): Promise<void> {
      assertAppDatabaseWritable(db);
      if (!operation.jobId) throw new Error('export job id missing');
      const jobId = operation.jobId;
      await transaction(db, async (transaction) => {
        const operationResult = await transaction.runAsync("UPDATE workflow_operations SET updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?", now, operation.id, owner);
        if (changes(operationResult) !== 1) throw new Error('export operation lease lost');
        await transaction.runAsync("UPDATE tasks SET export_state='EXPORTING', export_error=NULL, updated_at=MAX(updated_at, ?) WHERE id=?", now, jobId);
        await transaction.runAsync("UPDATE media_assets SET export_status='EXPORTING', updated_at=? WHERE id=?", now, payload.assetId);
        await transaction.runAsync(
          "INSERT INTO media_deliveries (id,asset_id,target,status,error,created_at,updated_at) VALUES (?,?,'system-gallery','EXPORTING',NULL,?,?) ON CONFLICT(id) DO UPDATE SET status='EXPORTING',error=NULL,updated_at=excluded.updated_at",
          deliveryId(payload), payload.assetId, now, now,
        );
      });
    },
    async commitSuccess(input: ExportSuccessInput): Promise<void> {
      assertAppDatabaseWritable(db);
      await transaction(db, async (transaction) => {
        await transaction.runAsync(
          "INSERT INTO media_deliveries (id,asset_id,target,uri,status,error,created_at,updated_at) VALUES (?,?,'system-gallery',?,'EXPORTED',NULL,?,?) ON CONFLICT(id) DO UPDATE SET uri=excluded.uri,status='EXPORTED',error=NULL,updated_at=excluded.updated_at",
          `${input.assetId}:system-gallery`, input.assetId, input.galleryUri, input.now, input.now,
        );
        const assetResult = await transaction.runAsync(
          "UPDATE media_assets SET local_path=CASE WHEN ? THEN local_path ELSE NULL END,status=CASE WHEN ? THEN status ELSE 'queued' END,export_status='EXPORTED',updated_at=? WHERE id=?",
          input.keepPrivateCopy ? 1 : 0, input.keepPrivateCopy ? 1 : 0, input.now, input.assetId,
        );
        if (changes(assetResult) !== 1) throw new Error('media asset projection missing');
        const taskResult = await transaction.runAsync(
          "UPDATE tasks SET local_uri=CASE WHEN ? THEN local_uri ELSE NULL END,gallery_uri=?,export_state='EXPORTED',export_error=NULL,exported_at=?,updated_at=MAX(updated_at, ?) WHERE id=?",
          input.keepPrivateCopy ? 1 : 0, input.galleryUri, input.now, input.now, input.jobId,
        );
        if (changes(taskResult) !== 1) throw new Error('task projection missing');
        if (!input.keepPrivateCopy && input.sourceKind === 'cas' && input.blobSha256) {
          await transaction.runAsync(
            "DELETE FROM artifact_blob_refs WHERE blob_sha256=? AND owner_type='workflow_artifact' AND owner_id=?",
            input.blobSha256, input.referenceOwnerId,
          );
        }
        const operationResult = await transaction.runAsync(
          "UPDATE workflow_operations SET state='SUCCEEDED',lease_owner=NULL,lease_expires_at=NULL,last_error_json=NULL,updated_at=? WHERE id=? AND state='CLAIMED' AND lease_owner=?",
          input.now, input.operationId, input.owner,
        );
        if (changes(operationResult) !== 1) throw new Error('export operation lease lost');
      });
    },
    async retry(operation: WorkflowOperation, owner: string, payload: ExportPayload, input: ExportFailureInput & { nextRetryAt: number }): Promise<void> {
      assertAppDatabaseWritable(db);
      if (!operation.jobId) throw new Error('export job id missing');
      const jobId = operation.jobId;
      await transaction(db, async (transaction) => {
        await transaction.runAsync("UPDATE tasks SET export_state='QUEUED',export_error=?,updated_at=MAX(updated_at, ?) WHERE id=?", input.error.code, input.now, jobId);
        await transaction.runAsync("UPDATE media_assets SET export_status='QUEUED',updated_at=? WHERE id=?", input.now, payload.assetId);
        await transaction.runAsync("UPDATE media_deliveries SET status='QUEUED',error=?,updated_at=? WHERE id=?", input.error.code, input.now, deliveryId(payload));
        const result = await transaction.runAsync("UPDATE workflow_operations SET state='PENDING',next_retry_at=?,lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE id=? AND state='CLAIMED' AND lease_owner=?", input.nextRetryAt, JSON.stringify(input.error), input.now, operation.id, owner);
        if (changes(result) !== 1) throw new Error('export operation lease lost');
      });
    },
    async finishFailure(operation: WorkflowOperation, owner: string, payload: ExportPayload | undefined, now: number, error: NormalizedError): Promise<void> {
      assertAppDatabaseWritable(db);
      await transaction(db, async (transaction) => {
        if (operation.jobId) await transaction.runAsync("UPDATE tasks SET export_state='EXPORT_FAILED',export_error=?,updated_at=MAX(updated_at, ?) WHERE id=?", error.code, now, operation.jobId);
        if (payload) {
          await transaction.runAsync("UPDATE media_assets SET export_status='EXPORT_FAILED',updated_at=? WHERE id=?", now, payload.assetId);
          await transaction.runAsync(
            "INSERT INTO media_deliveries (id,asset_id,target,status,error,created_at,updated_at) VALUES (?,?,'system-gallery','FAILED',?,?,?) ON CONFLICT(id) DO UPDATE SET status='FAILED',error=excluded.error,updated_at=excluded.updated_at",
            deliveryId(payload), payload.assetId, error.code, now, now,
          );
        }
        const result = await transaction.runAsync("UPDATE workflow_operations SET state='FAILED',lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE id=? AND state='CLAIMED' AND lease_owner=?", JSON.stringify(error), now, operation.id, owner);
        if (changes(result) !== 1) throw new Error('export operation lease lost');
      });
    },
  };
}
