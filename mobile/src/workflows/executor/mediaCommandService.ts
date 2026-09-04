import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritable } from '../../storage/database';
import type { ArtifactRecord } from '../../jobs/types';
import { artifactExportDisplayName, type SystemGalleryIntent } from './artifactOperation';
import { createOperationRepository } from './operationRepository';
import type { ExportPayload } from './exportOperation';
import type { OperationKind, WorkflowOperation } from './types';

type TaskRow = { id: string; video_url?: string | null; local_uri?: string | null };
type AssetRow = { id: string; task_id: string; source_url: string; local_path?: string | null; artifact_id?: string | null; mime_type: string };
type ArtifactRow = { id: string; job_id: string; kind: string; uri?: string | null; mime?: string | null; metadata_json?: string | null };
type BlobRow = { sha256: string; relative_path: string };
type OperationRow = { id: string; idempotency_key: string; payload_json: string; state: string };

export type MediaCommandResult = {
  status: 'queued' | 'in-flight' | 'already-complete';
  operation?: WorkflowOperation;
};

export type MediaCommandService = {
  requestDownload(taskId: string): Promise<MediaCommandResult>;
  requestRedownload(taskId: string): Promise<MediaCommandResult>;
  requestExport(taskId: string, policy: { keepPrivateCopy: boolean }): Promise<MediaCommandResult>;
  hasActiveMediaOperation(taskId: string): boolean;
};

type Context = { task: TaskRow; asset: AssetRow; artifact: ArtifactRecord };

function manualFamilyPattern(canonicalKey: string): string {
  return `${canonicalKey.replace(/[\\%_]/g, (value) => `\\${value}`)}:manual:%`;
}

function transaction<T>(db: SQLiteDatabase, work: () => T): T {
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

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

function parseMetadata(source: string | null | undefined): Record<string, unknown> | undefined {
  if (!source) return undefined;
  try {
    const value = JSON.parse(source);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch { return undefined; }
}

function loadContext(db: SQLiteDatabase, taskId: string): Context {
  const task = db.getFirstSync<TaskRow>('SELECT id,video_url,local_uri FROM tasks WHERE id=? LIMIT 1', taskId);
  if (!task) throw new Error('TASK_NOT_FOUND');
  const asset = db.getFirstSync<AssetRow>(
    "SELECT id,task_id,source_url,local_path,artifact_id,mime_type FROM media_assets WHERE task_id=? AND kind='video' ORDER BY updated_at DESC,id ASC LIMIT 1",
    taskId,
  );
  if (!asset) throw new Error('MEDIA_ASSET_NOT_FOUND');
  const row = asset.artifact_id
    ? db.getFirstSync<ArtifactRow>('SELECT id,job_id,kind,uri,mime,metadata_json FROM workflow_artifacts WHERE job_id=? AND id=? LIMIT 1', taskId, asset.artifact_id)
    : db.getFirstSync<ArtifactRow>("SELECT id,job_id,kind,uri,mime,metadata_json FROM workflow_artifacts WHERE job_id=? AND kind='video' ORDER BY id ASC LIMIT 1", taskId);
  const artifact: ArtifactRecord = row
    ? { id: row.id, jobId: row.job_id, kind: row.kind as ArtifactRecord['kind'], uri: row.uri ?? undefined, mime: row.mime ?? undefined, metadata: parseMetadata(row.metadata_json) }
    : { id: asset.artifact_id || 'recovered-primary-video', jobId: taskId, kind: 'video', uri: asset.source_url || task.video_url || undefined, mime: asset.mime_type || 'video/mp4' };
  if (!artifact.uri?.trim()) throw new Error('ARTIFACT_SOURCE_MISSING');
  return { task, asset, artifact };
}

function activeOperation(db: SQLiteDatabase, taskId: string, kind: OperationKind, canonicalKey: string): OperationRow | undefined {
  return db.getFirstSync<OperationRow>(
    "SELECT id,idempotency_key,payload_json,state FROM workflow_operations WHERE job_id=? AND kind=? AND state IN ('PENDING','CLAIMED') AND (idempotency_key=? OR idempotency_key LIKE ? ESCAPE '\\') ORDER BY created_at DESC,id DESC LIMIT 1",
    taskId, kind, canonicalKey, manualFamilyPattern(canonicalKey),
  ) ?? undefined;
}

function nextIdentity(db: SQLiteDatabase, kind: OperationKind, canonicalId: string, canonicalKey: string): { id: string; key: string } {
  const rows = db.getAllSync<{ idempotency_key: string }>(
    "SELECT idempotency_key FROM workflow_operations WHERE kind=? AND (idempotency_key=? OR idempotency_key LIKE ? ESCAPE '\\') ORDER BY idempotency_key",
    kind, canonicalKey, manualFamilyPattern(canonicalKey),
  );
  if (rows.length === 0) return { id: canonicalId, key: canonicalKey };
  const generation = rows.reduce((maximum, row) => {
    const match = row.idempotency_key.match(/:manual:(\d+)$/);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
  return { id: `${canonicalId}:manual:${generation}`, key: `${canonicalKey}:manual:${generation}` };
}

function mergeDeliveryIntent(row: OperationRow, intent: SystemGalleryIntent): string {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(row.payload_json) as Record<string, unknown>; } catch { /* invalid payload is replaced below */ }
  return JSON.stringify({ ...payload, deliveryIntent: intent });
}

function hasDeliveryIntent(row: OperationRow): boolean {
  try {
    const payload = JSON.parse(row.payload_json) as { deliveryIntent?: unknown };
    return payload.deliveryIntent != null;
  } catch { return false; }
}

export function createMediaCommandService(options: {
  db: SQLiteDatabase;
  fileExists(uri: string): Promise<boolean>;
  resolveCasUri(relativePath: string): string;
  now?: () => number;
}): MediaCommandService {
  const { db } = options;
  const now = options.now ?? Date.now;
  const operations = createOperationRepository(db);

  const casSource = async (context: Context): Promise<{ sha256: string; uri: string } | undefined> => {
    const row = db.getFirstSync<BlobRow>(
      "SELECT b.sha256,b.relative_path FROM artifact_blob_refs r JOIN artifact_blobs b ON b.sha256=r.blob_sha256 WHERE r.owner_type='workflow_artifact' AND r.owner_id=? LIMIT 1",
      `${context.task.id}:${context.artifact.id}`,
    );
    if (!row) return undefined;
    const uri = options.resolveCasUri(row.relative_path);
    return await options.fileExists(uri) ? { sha256: row.sha256, uri } : undefined;
  };

  const requestDownload = async (taskId: string, deliveryIntent?: SystemGalleryIntent): Promise<MediaCommandResult> => {
    assertAppDatabaseWritable(db);
    const initial = loadContext(db, taskId);
    if (!deliveryIntent && await casSource(initial)) return { status: 'already-complete' };
    const outcome = transaction(db, () => {
      assertAppDatabaseWritable(db);
      const context = loadContext(db, taskId);
      const canonicalKey = `artifact:${taskId}:${context.artifact.id}`;
      const active = activeOperation(db, taskId, 'ARTIFACT_DOWNLOAD', canonicalKey);
      if (active) {
        if (deliveryIntent && !hasDeliveryIntent(active)) {
          const timestamp = now();
          db.runSync('UPDATE workflow_operations SET payload_json=?,updated_at=? WHERE id=?', mergeDeliveryIntent(active, deliveryIntent), timestamp, active.id);
          db.runSync("UPDATE tasks SET export_state='QUEUED',export_error=NULL,updated_at=MAX(updated_at,?) WHERE id=?", timestamp, taskId);
          db.runSync("UPDATE media_assets SET export_status='QUEUED',updated_at=? WHERE id=?", timestamp, context.asset.id);
          db.runSync(
            "INSERT INTO media_deliveries (id,asset_id,target,status,error,created_at,updated_at) VALUES (?,?,'system-gallery','QUEUED',NULL,?,?) ON CONFLICT(id) DO UPDATE SET status='QUEUED',error=NULL,updated_at=excluded.updated_at",
            `${context.asset.id}:system-gallery`, context.asset.id, timestamp, timestamp,
          );
        }
        return { id: active.id, status: 'in-flight' as const };
      }
      const identity = nextIdentity(db, 'ARTIFACT_DOWNLOAD', `${taskId}:artifact:${context.artifact.id}`, canonicalKey);
      const timestamp = now();
      const payload = { artifact: context.artifact, ...(deliveryIntent ? { deliveryIntent } : {}) };
      db.runSync(
        "INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,'ARTIFACT_DOWNLOAD',?,?,?,'PENDING',0,?,?,?)",
        identity.id, taskId, identity.key, JSON.stringify(payload), timestamp, timestamp, timestamp,
      );
      if (changes(db.runSync("UPDATE tasks SET download_state='ENQUEUED',download_error=NULL,download_progress=0,updated_at=MAX(updated_at,?) WHERE id=?", timestamp, taskId)) !== 1) throw new Error('TASK_NOT_FOUND');
      if (changes(db.runSync("UPDATE media_assets SET status='queued',updated_at=? WHERE id=? AND task_id=?", timestamp, context.asset.id, taskId)) !== 1) throw new Error('MEDIA_ASSET_NOT_FOUND');
      if (deliveryIntent) {
        db.runSync("UPDATE tasks SET export_state='QUEUED',export_error=NULL,updated_at=MAX(updated_at,?) WHERE id=?", timestamp, taskId);
        db.runSync("UPDATE media_assets SET export_status='QUEUED',updated_at=? WHERE id=?", timestamp, context.asset.id);
        db.runSync(
          "INSERT INTO media_deliveries (id,asset_id,target,status,error,created_at,updated_at) VALUES (?,?,'system-gallery','QUEUED',NULL,?,?) ON CONFLICT(id) DO UPDATE SET status='QUEUED',error=NULL,updated_at=excluded.updated_at",
          `${context.asset.id}:system-gallery`, context.asset.id, timestamp, timestamp,
        );
      }
      return { id: identity.id, status: 'queued' as const };
    });
    return { status: outcome.status, operation: operations.get(outcome.id) };
  };

  const enqueueExport = (context: Context, payload: ExportPayload): MediaCommandResult => {
    const outcome = transaction(db, () => {
      assertAppDatabaseWritable(db);
      const canonicalKey = `export:${context.task.id}:${context.artifact.id}:system-gallery`;
      const active = activeOperation(db, context.task.id, 'EXPORT', canonicalKey);
      if (active) return { id: active.id, status: 'in-flight' as const };
      const identity = nextIdentity(
        db, 'EXPORT', `${context.task.id}:export:${context.artifact.id}:system-gallery`,
        canonicalKey,
      );
      const timestamp = now();
      db.runSync(
        "INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,'EXPORT',?,?,?,'PENDING',0,?,?,?)",
        identity.id, context.task.id, identity.key, JSON.stringify(payload), timestamp, timestamp, timestamp,
      );
      if (changes(db.runSync("UPDATE tasks SET export_state='QUEUED',export_error=NULL,updated_at=MAX(updated_at,?) WHERE id=?", timestamp, context.task.id)) !== 1) throw new Error('TASK_NOT_FOUND');
      if (changes(db.runSync("UPDATE media_assets SET export_status='QUEUED',updated_at=? WHERE id=? AND task_id=?", timestamp, context.asset.id, context.task.id)) !== 1) throw new Error('MEDIA_ASSET_NOT_FOUND');
      db.runSync(
        "INSERT INTO media_deliveries (id,asset_id,target,status,error,created_at,updated_at) VALUES (?,?,'system-gallery','QUEUED',NULL,?,?) ON CONFLICT(id) DO UPDATE SET status='QUEUED',error=NULL,updated_at=excluded.updated_at",
        `${context.asset.id}:system-gallery`, context.asset.id, timestamp, timestamp,
      );
      return { id: identity.id, status: 'queued' as const };
    });
    return { status: outcome.status, operation: operations.get(outcome.id) };
  };

  return {
    requestDownload: (taskId) => requestDownload(taskId),
    async requestRedownload(taskId) {
      assertAppDatabaseWritable(db);
      const outcome = transaction(db, () => {
        assertAppDatabaseWritable(db);
        const context = loadContext(db, taskId);
        const canonicalKey = `artifact:${taskId}:${context.artifact.id}`;
        const active = activeOperation(db, taskId, 'ARTIFACT_DOWNLOAD', canonicalKey);
        if (active) return { id: active.id, status: 'in-flight' as const };

        const timestamp = now();
        const identity = nextIdentity(db, 'ARTIFACT_DOWNLOAD', `${taskId}:artifact:${context.artifact.id}`, canonicalKey);
        if (changes(db.runSync(
          "UPDATE tasks SET local_uri=NULL,gallery_uri=NULL,download_state='ENQUEUED',download_error=NULL,download_progress=0,export_state='NOT_REQUESTED',export_error=NULL,exported_at=NULL,updated_at=MAX(updated_at,?) WHERE id=?",
          timestamp, taskId,
        )) !== 1) throw new Error('TASK_NOT_FOUND');
        if (changes(db.runSync(
          "UPDATE media_assets SET local_path=NULL,status='queued',export_status='NOT_REQUESTED',updated_at=? WHERE id=? AND task_id=?",
          timestamp, context.asset.id, taskId,
        )) !== 1) throw new Error('MEDIA_ASSET_NOT_FOUND');
        db.runSync(
          "UPDATE media_deliveries SET status='FAILED',error='SOURCE_INVALIDATED',updated_at=? WHERE asset_id=?",
          timestamp, context.asset.id,
        );
        db.runSync(
          "DELETE FROM artifact_blob_refs WHERE owner_type='workflow_artifact' AND owner_id=?",
          `${taskId}:${context.artifact.id}`,
        );
        db.runSync(
          "INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,'ARTIFACT_DOWNLOAD',?,?,?,'PENDING',0,?,?,?)",
          identity.id, taskId, identity.key, JSON.stringify({ artifact: context.artifact }), timestamp, timestamp, timestamp,
        );
        return { id: identity.id, status: 'queued' as const };
      });
      return { status: outcome.status, operation: operations.get(outcome.id) };
    },
    async requestExport(taskId, policy) {
      assertAppDatabaseWritable(db);
      const context = loadContext(db, taskId);
      const delivery = db.getFirstSync<{ status: string }>('SELECT status FROM media_deliveries WHERE id=? LIMIT 1', `${context.asset.id}:system-gallery`);
      if (delivery?.status === 'EXPORTED') return { status: 'already-complete' };
      const active = activeOperation(db, taskId, 'EXPORT', `export:${taskId}:${context.artifact.id}:system-gallery`);
      if (active) return { status: 'in-flight', operation: operations.get(active.id) };
      const cas = await casSource(context);
      if (cas) return enqueueExport(context, {
        assetId: context.asset.id, artifactId: context.artifact.id, sourceUri: cas.uri,
        sourceKind: 'cas', blobSha256: cas.sha256, keepPrivateCopy: policy.keepPrivateCopy,
        displayName: artifactExportDisplayName(taskId, context.artifact.id),
      });
      const candidate = context.asset.local_path || context.task.local_uri;
      if (candidate?.startsWith('file://') && !candidate.includes('/cas/sha256/') && await options.fileExists(candidate)) {
        return enqueueExport(context, {
          assetId: context.asset.id, artifactId: context.artifact.id, sourceUri: candidate,
          sourceKind: 'legacy', keepPrivateCopy: policy.keepPrivateCopy,
          displayName: artifactExportDisplayName(taskId, context.artifact.id),
        });
      }
      return requestDownload(taskId, { target: 'system-gallery', keepPrivateCopy: policy.keepPrivateCopy });
    },
    hasActiveMediaOperation(taskId) {
      return Boolean(db.getFirstSync(
        "SELECT 1 AS present FROM workflow_operations WHERE job_id=? AND kind IN ('ARTIFACT_DOWNLOAD','EXPORT') AND state IN ('PENDING','CLAIMED') LIMIT 1",
        taskId,
      ));
    },
  };
}
