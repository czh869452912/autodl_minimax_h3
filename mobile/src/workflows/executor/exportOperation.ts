import { withWriteTransaction } from '../../storage/sqliteBusy';
import * as FileSystem from 'expo-file-system/legacy';
import type { AppDatabase } from '../../storage/appDatabase';
import type { NormalizedError } from '../../jobs/types';
import { assertAppDatabaseWritableAsync } from '../../storage/database';
import type { WorkflowOperation } from './types';

export type ExportPayload = {
  variant?: 'original';
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

async function transaction(db: AppDatabase, work: (transaction: AppDatabase) => Promise<void>): Promise<void> {
  await withWriteTransaction(db, work);
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
    && (value.variant == null || (value.variant === 'original' && value.sourceKind === 'cas'))
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
    result = await deps.publish(payload.sourceUri, { mediaId: payload.variant === 'original' ? `${payload.assetId}:original` : payload.assetId, displayName: payload.displayName });
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

export function createSqliteExportStore(db: AppDatabase) {
  const deliveryId = (payload: ExportPayload) => `${payload.assetId}:system-gallery${payload.variant === 'original' ? ':original' : ''}`;
  // A paired save is complete only when both independently durable publications finish.
  const refreshStatus = async (transaction: AppDatabase, jobId: string, assetId: string, now: number) => {
    const task = await transaction.getFirstAsync<{ download_state: string; download_error: string | null }>('SELECT download_state,download_error FROM tasks WHERE id=?', jobId);
    const originalOnly = task?.download_state === 'DOWNLOAD_FAILED' && Boolean(task.download_error?.startsWith('ARTIFACT_COMPATIBILITY_'));
    const allRows = await transaction.getAllAsync<{ id: string; status: string; error: string | null }>(
      'SELECT id,status,error FROM media_deliveries WHERE id IN (?,?)', `${assetId}:system-gallery`, `${assetId}:system-gallery:original`,
    );
    const rows = originalOnly ? allRows.filter(row => row.id.endsWith(':system-gallery:original')) : allRows;
    const primary = rows.find(row => row.id === `${assetId}:system-gallery${originalOnly ? ':original' : ''}`);
    const failed = rows.find(row => row.status === 'FAILED');
    const status = rows.length === 0 ? 'NOT_REQUESTED' : failed ? 'EXPORT_FAILED' : primary && rows.every(row => row.status === 'EXPORTED') ? 'EXPORTED'
      : rows.some(row => row.status === 'EXPORTING') ? 'EXPORTING' : 'QUEUED';
    await transaction.runAsync('UPDATE tasks SET export_state=?,export_error=?,updated_at=MAX(updated_at,?) WHERE id=?', status, failed?.error ?? null, now, jobId);
    await transaction.runAsync('UPDATE media_assets SET export_status=?,updated_at=? WHERE id=?', status, now, assetId);
  };
  return {
    async refreshStatus(jobId: string, assetId: string, now: number): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await transaction(db, txn => refreshStatus(txn, jobId, assetId, now));
    },
    async canPublish(operation: WorkflowOperation, owner: string, payload: ExportPayload): Promise<boolean> {
      return Boolean(await db.getFirstAsync(
        "SELECT 1 AS present FROM workflow_operations o WHERE o.id=? AND o.state='CLAIMED' AND o.lease_owner=? AND EXISTS (SELECT 1 FROM tasks t WHERE t.id=o.job_id) AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id=? AND m.task_id=o.job_id) LIMIT 1",
        operation.id, owner, payload.assetId,
      ));
    },
    async markExporting(operation: WorkflowOperation, owner: string, payload: ExportPayload, now: number): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
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
        await refreshStatus(transaction, jobId, payload.assetId, now);
      });
    },
    async commitSuccess(input: ExportSuccessInput): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await transaction(db, async (transaction) => {
        await transaction.runAsync(
          "INSERT INTO media_deliveries (id,asset_id,target,uri,status,error,created_at,updated_at) VALUES (?,?,'system-gallery',?,'EXPORTED',NULL,?,?) ON CONFLICT(id) DO UPDATE SET uri=excluded.uri,status='EXPORTED',error=NULL,updated_at=excluded.updated_at",
          deliveryId(input), input.assetId, input.galleryUri, input.now, input.now,
        );
        if (input.variant !== 'original') {
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
        }
        await refreshStatus(transaction, input.jobId, input.assetId, input.now);
        const operationResult = await transaction.runAsync(
          "UPDATE workflow_operations SET state='SUCCEEDED',lease_owner=NULL,lease_expires_at=NULL,last_error_json=NULL,updated_at=? WHERE id=? AND state='CLAIMED' AND lease_owner=?",
          input.now, input.operationId, input.owner,
        );
        if (changes(operationResult) !== 1) throw new Error('export operation lease lost');
      });
    },
    async retry(operation: WorkflowOperation, owner: string, payload: ExportPayload, input: ExportFailureInput & { nextRetryAt: number }): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      if (!operation.jobId) throw new Error('export job id missing');
      const jobId = operation.jobId;
      await transaction(db, async (transaction) => {
        await transaction.runAsync("UPDATE tasks SET export_state='QUEUED',export_error=?,updated_at=MAX(updated_at, ?) WHERE id=?", input.error.code, input.now, jobId);
        await transaction.runAsync("UPDATE media_assets SET export_status='QUEUED',updated_at=? WHERE id=?", input.now, payload.assetId);
        await transaction.runAsync("UPDATE media_deliveries SET status='QUEUED',error=?,updated_at=? WHERE id=?", input.error.code, input.now, deliveryId(payload));
        await refreshStatus(transaction, jobId, payload.assetId, input.now);
        const result = await transaction.runAsync("UPDATE workflow_operations SET state='PENDING',next_retry_at=?,lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE id=? AND state='CLAIMED' AND lease_owner=?", input.nextRetryAt, JSON.stringify(input.error), input.now, operation.id, owner);
        if (changes(result) !== 1) throw new Error('export operation lease lost');
      });
    },
    async finishFailure(operation: WorkflowOperation, owner: string, payload: ExportPayload | undefined, now: number, error: NormalizedError): Promise<void> {
      await assertAppDatabaseWritableAsync(db);
      await transaction(db, async (transaction) => {
        if (operation.jobId) await transaction.runAsync("UPDATE tasks SET export_state='EXPORT_FAILED',export_error=?,updated_at=MAX(updated_at, ?) WHERE id=?", error.code, now, operation.jobId);
        if (payload) {
          await transaction.runAsync("UPDATE media_assets SET export_status='EXPORT_FAILED',updated_at=? WHERE id=?", now, payload.assetId);
          await transaction.runAsync(
            "INSERT INTO media_deliveries (id,asset_id,target,status,error,created_at,updated_at) VALUES (?,?,'system-gallery','FAILED',?,?,?) ON CONFLICT(id) DO UPDATE SET status='FAILED',error=excluded.error,updated_at=excluded.updated_at",
            deliveryId(payload), payload.assetId, error.code, now, now,
          );
        }
        if (payload && operation.jobId) await refreshStatus(transaction, operation.jobId, payload.assetId, now);
        const result = await transaction.runAsync("UPDATE workflow_operations SET state='FAILED',lease_owner=NULL,lease_expires_at=NULL,last_error_json=?,updated_at=? WHERE id=? AND state='CLAIMED' AND lease_owner=?", JSON.stringify(error), now, operation.id, owner);
        if (changes(result) !== 1) throw new Error('export operation lease lost');
      });
    },
  };
}
