import type { SQLiteDatabase } from 'expo-sqlite';
import type { ArtifactRecord } from '../jobs/types';
import { collectGarbage } from './cas';
import { createCasRepository } from './casRepository';

export type ReconciliationSummary = {
  scanned: number;
  repaired: number;
  staleFiles: number;
  garbageDeleted: number;
  garbageFailed: number;
};

type TaskRow = {
  id: string;
  prompt: string;
  video_url?: string | null;
  local_uri?: string | null;
  download_state: string;
  gallery_uri?: string | null;
  export_state: string;
  created_at: number;
  updated_at: number;
};

type ArtifactRow = { id: string; job_id: string; kind: string; uri?: string | null; mime?: string | null; metadata_json?: string | null };
type AssetRow = { id: string; local_path?: string | null; source_url: string; status: string };

function parseArtifact(source: string, jobId: string): ArtifactRecord | undefined {
  try {
    const value = JSON.parse(source)?.artifact as Partial<ArtifactRecord> | undefined;
    if (!value || value.jobId !== jobId || typeof value.id !== 'string' || typeof value.kind !== 'string') return undefined;
    if (value.uri != null && typeof value.uri !== 'string') return undefined;
    return value as ArtifactRecord;
  } catch { return undefined; }
}

function insertAsset(db: SQLiteDatabase, task: TaskRow, artifact: ArtifactRecord, workflowId: string, now: number): boolean {
  const sourceUrl = artifact.uri?.trim() || task.video_url?.trim() || '';
  if (!sourceUrl) return false;
  const localPath = artifact.kind === 'video' ? task.local_uri ?? null : null;
  const result = db.runSync(
    "INSERT OR IGNORE INTO media_assets (id,task_id,title,prompt,source_url,local_path,mime_type,status,created_at,updated_at,artifact_id,job_id,workflow_id,kind,export_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    `${task.id}:${artifact.id}`, task.id, task.prompt.slice(0, 48) || workflowId, task.prompt, sourceUrl,
    localPath, artifact.mime || (artifact.kind === 'video' ? 'video/mp4' : `${artifact.kind}/*`),
    localPath ? 'downloaded' : 'queued', task.created_at, now, artifact.id, task.id, workflowId, artifact.kind,
    task.export_state === 'EXPORTED' ? 'EXPORTED' : 'NOT_REQUESTED',
  ) as { changes?: number | bigint };
  return Number(result.changes ?? 0) === 1;
}

export async function reconcileMediaState(options: {
  db: SQLiteDatabase;
  limit?: number;
  fileExists(uri: string): Promise<boolean>;
  removeCasPath(relativePath: string): Promise<void>;
  now?: () => number;
}): Promise<ReconciliationSummary> {
  const limit = Math.max(1, Math.min(32, Math.floor(options.limit ?? 8)));
  const now = options.now?.() ?? Date.now();
  const tasks = options.db.getAllSync<TaskRow>(
    "SELECT id,prompt,video_url,local_uri,download_state,gallery_uri,export_state,created_at,updated_at FROM tasks WHERE status IN ('SUCCESS','PARTIAL_SUCCESS') ORDER BY updated_at ASC,id ASC LIMIT ?",
    limit,
  );
  let repaired = 0;
  let staleFiles = 0;

  for (const task of tasks) {
    let changed = false;
    const job = options.db.getFirstSync<{ workflow_id: string }>('SELECT workflow_id FROM workflow_jobs WHERE id=? LIMIT 1', task.id);
    const workflowId = job?.workflow_id ?? 'recovered';
    let artifacts = options.db.getAllSync<ArtifactRow>('SELECT * FROM workflow_artifacts WHERE job_id=? ORDER BY id', task.id);
    if (artifacts.length === 0) {
      const operationRows = options.db.getAllSync<{ payload_json: string }>(
        "SELECT payload_json FROM workflow_operations WHERE job_id=? AND kind='ARTIFACT_DOWNLOAD' AND state='SUCCEEDED' ORDER BY created_at ASC,id ASC",
        task.id,
      );
      for (const row of operationRows) {
        const artifact = parseArtifact(row.payload_json, task.id);
        if (!artifact) continue;
        const result = options.db.runSync(
          'INSERT OR IGNORE INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
          artifact.id, task.id, artifact.kind, artifact.uri ?? null, artifact.mime ?? null,
          artifact.metadata ? JSON.stringify(artifact.metadata) : null,
        ) as { changes?: number | bigint };
        changed = Number(result.changes ?? 0) === 1 || changed;
      }
      artifacts = options.db.getAllSync<ArtifactRow>('SELECT * FROM workflow_artifacts WHERE job_id=? ORDER BY id', task.id);
    }

    for (const row of artifacts) {
      const artifact: ArtifactRecord = {
        id: row.id, jobId: task.id, kind: row.kind as ArtifactRecord['kind'], uri: row.uri ?? undefined,
        mime: row.mime ?? undefined,
      };
      changed = insertAsset(options.db, task, artifact, workflowId, now) || changed;
    }

    let assets = options.db.getAllSync<AssetRow>("SELECT id,local_path,source_url,status FROM media_assets WHERE task_id=? AND kind='video' ORDER BY updated_at DESC,id ASC", task.id);
    if (assets.length === 0 && (task.local_uri || task.video_url)) {
      changed = insertAsset(options.db, task, {
        id: 'recovered-primary-video', jobId: task.id, kind: 'video', uri: task.video_url ?? undefined, mime: 'video/mp4',
      }, workflowId, now) || changed;
      assets = options.db.getAllSync<AssetRow>("SELECT id,local_path,source_url,status FROM media_assets WHERE task_id=? AND kind='video' ORDER BY updated_at DESC,id ASC", task.id);
    }

    const checked = new Map<string, boolean>();
    const exists = async (uri: string) => {
      if (!checked.has(uri)) checked.set(uri, await options.fileExists(uri));
      return checked.get(uri)!;
    };
    const localUris = new Set([task.local_uri, ...assets.map((asset) => asset.local_path)].filter((uri): uri is string => Boolean(uri)));
    for (const uri of localUris) {
      if (await exists(uri)) continue;
      staleFiles += 1;
      changed = true;
      const hasRemote = Boolean(task.video_url);
      options.db.runSync("UPDATE tasks SET local_uri=NULL,download_state=?,download_error=?,download_progress=NULL,updated_at=MAX(updated_at,?) WHERE id=? AND local_uri=?", hasRemote ? 'IDLE' : 'DOWNLOAD_FAILED', hasRemote ? null : 'ARTIFACT_SOURCE_MISSING', now, task.id, uri);
      options.db.runSync("UPDATE media_assets SET local_path=NULL,status=?,updated_at=? WHERE task_id=? AND local_path=?", hasRemote ? 'queued' : 'failed', now, task.id, uri);
    }

    if (task.export_state === 'EXPORTED' && task.gallery_uri && assets[0]) {
      const result = options.db.runSync(
        "INSERT OR IGNORE INTO media_deliveries (id,asset_id,target,uri,status,error,created_at,updated_at) VALUES (?,?,'system-gallery',?,'EXPORTED',NULL,?,?)",
        `${assets[0].id}:system-gallery`, assets[0].id, task.gallery_uri, now, now,
      ) as { changes?: number | bigint };
      changed = Number(result.changes ?? 0) === 1 || changed;
      options.db.runSync("UPDATE media_assets SET export_status='EXPORTED',updated_at=MAX(updated_at,?) WHERE id=?", now, assets[0].id);
    }
    if (changed) repaired += 1;
  }

  const garbage = await collectGarbage({
    repository: createCasRepository(options.db),
    files: { remove: options.removeCasPath },
    limit,
  });
  return {
    scanned: tasks.length,
    repaired,
    staleFiles,
    garbageDeleted: garbage.deleted,
    garbageFailed: garbage.failed,
  };
}
