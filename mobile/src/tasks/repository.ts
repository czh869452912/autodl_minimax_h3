import type { SQLiteDatabase } from 'expo-sqlite';
import type { TaskMediaPatch, TaskRecord } from './types';
import * as FileSystem from 'expo-file-system/legacy';
import { assertAppDatabaseWritable } from '../storage/database';

export type TaskPageCursor = { createdAt: number; id: string };
export type { TaskCard, TaskCursor } from './taskCard';
export type TaskPageOptions = { limit?: number; cursor?: TaskPageCursor; status?: TaskRecord['status']; query?: string };
function transaction<T>(db: SQLiteDatabase, work: () => T): T {
  if (typeof db.withTransactionSync === 'function') {
    let result!: T;
    db.withTransactionSync(() => { result = work(); });
    return result;
  }
  db.execSync('BEGIN IMMEDIATE');
  try { const result = work(); db.execSync('COMMIT'); return result; } catch (error) { try { db.execSync('ROLLBACK'); } catch { /* best effort */ } throw error; }
}
export function createTaskRepository(db: SQLiteDatabase) {
  const parseJson = <T>(source: string | null | undefined, fallback: T): T => { if (!source) return fallback; try { return JSON.parse(source) as T; } catch { return fallback; } };
  const map = (r: any): TaskRecord => ({ id: r.id, prompt: r.prompt, status: r.status, resolution: r.resolution, duration: Number(r.duration), seed: r.seed || undefined, workflowId: r.workflow_id || undefined, workflowVersion: r.workflow_version || undefined, workflowContentHash: r.workflow_hash || undefined, adapterId: r.adapter_id || undefined, adapterVersion: r.adapter_version || undefined, inputSnapshot: parseJson(r.input_json, undefined), images: parseJson(r.images_json, undefined), audios: parseJson(r.audios_json, undefined), videoUrl: r.video_url || undefined, localUri: r.local_uri || undefined, thumbnailUrl: r.thumbnail_url || undefined, downloadState: r.download_state || (r.local_uri ? 'DOWNLOADED' : 'IDLE'), downloadError: r.download_error || undefined, downloadProgress: r.download_progress == null ? undefined : Number(r.download_progress), galleryUri: r.gallery_uri || undefined, exportState: r.export_state || 'NOT_REQUESTED', exportError: r.export_error || undefined, exportedAt: r.exported_at == null ? undefined : Number(r.exported_at), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), startedAt: r.started_at == null ? undefined : Number(r.started_at), executionDuration: r.execution_duration == null ? undefined : Number(r.execution_duration), syncError: r.sync_error || undefined, lastSyncAt: r.last_sync_at == null ? undefined : Number(r.last_sync_at) });
  const run = async (sql: string, ...params: any[]) => {
    assertAppDatabaseWritable(db);
    return typeof (db as any).runAsync === 'function' ? (db as any).runAsync(sql, ...params) : db.runSync(sql, ...params);
  };
  const all = async <T>(sql: string, ...params: any[]): Promise<T[]> => typeof (db as any).getAllAsync === 'function' ? ((await (db as any).getAllAsync(sql, ...params)) ?? []) : (db.getAllSync<T>(sql, ...params) ?? []);
  const first = async <T>(sql: string, ...params: any[]): Promise<T | null> => typeof (db as any).getFirstAsync === 'function' ? ((await (db as any).getFirstAsync(sql, ...params)) ?? null) : typeof (db as any).getFirstSync === 'function' ? ((db as any).getFirstSync(sql, ...params) ?? null) : ((await all<T>(sql, ...params))[0] ?? null);
  const updateMediaProjection = async (id: string, patch: TaskMediaPatch): Promise<boolean> => {
    const columns: Array<[keyof TaskMediaPatch, string]> = [
      ['localUri', 'local_uri'], ['thumbnailUrl', 'thumbnail_url'], ['downloadState', 'download_state'],
      ['downloadError', 'download_error'], ['downloadProgress', 'download_progress'], ['galleryUri', 'gallery_uri'],
      ['exportState', 'export_state'], ['exportError', 'export_error'], ['exportedAt', 'exported_at'],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of columns) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      assignments.push(`${column}=?`);
      values.push(patch[key] ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) {
      assignments.push('updated_at=MAX(updated_at, ?)');
      values.push(patch.updatedAt ?? 0);
    }
    if (!assignments.length) return Boolean(await first('SELECT 1 AS present FROM tasks WHERE id = ? LIMIT 1', id));
    const result = await run(`UPDATE tasks SET ${assignments.join(',')} WHERE id=?`, ...values, id) as { changes?: number } | undefined;
    return result?.changes == null ? true : result.changes > 0;
  };
  return {
    async upsert(t: TaskRecord) { await run('INSERT INTO tasks (id,prompt,status,resolution,duration,seed,images_json,audios_json,video_url,local_uri,thumbnail_url,download_state,download_error,download_progress,gallery_uri,export_state,export_error,exported_at,created_at,updated_at,started_at,execution_duration,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,sync_error,last_sync_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt,status=excluded.status,resolution=excluded.resolution,duration=excluded.duration,seed=excluded.seed,images_json=excluded.images_json,audios_json=excluded.audios_json,video_url=excluded.video_url,local_uri=excluded.local_uri,thumbnail_url=excluded.thumbnail_url,download_state=excluded.download_state,download_error=excluded.download_error,download_progress=excluded.download_progress,gallery_uri=excluded.gallery_uri,export_state=excluded.export_state,export_error=excluded.export_error,exported_at=excluded.exported_at,created_at=excluded.created_at,updated_at=excluded.updated_at,started_at=excluded.started_at,execution_duration=excluded.execution_duration,workflow_id=excluded.workflow_id,workflow_version=excluded.workflow_version,workflow_hash=excluded.workflow_hash,adapter_id=excluded.adapter_id,adapter_version=excluded.adapter_version,input_json=excluded.input_json,sync_error=excluded.sync_error,last_sync_at=excluded.last_sync_at', t.id, t.prompt, t.status, t.resolution, t.duration, t.seed ?? null, t.images ? JSON.stringify(t.images) : null, t.audios ? JSON.stringify(t.audios) : null, t.videoUrl ?? null, t.localUri ?? null, t.thumbnailUrl ?? null, t.downloadState ?? (t.localUri ? 'DOWNLOADED' : 'IDLE'), t.downloadError ?? null, t.downloadProgress ?? null, t.galleryUri ?? null, t.exportState ?? 'NOT_REQUESTED', t.exportError ?? null, t.exportedAt ?? null, t.createdAt, t.updatedAt, t.startedAt ?? null, t.executionDuration ?? null, t.workflowId ?? null, t.workflowVersion ?? null, t.workflowContentHash ?? null, t.adapterId ?? null, t.adapterVersion ?? null, t.inputSnapshot ? JSON.stringify(t.inputSnapshot) : null, t.syncError ?? null, t.lastSyncAt ?? null); },
    async upsertWorkflowProjection(t: TaskRecord) { await run('INSERT INTO tasks (id,prompt,status,resolution,duration,seed,images_json,audios_json,video_url,local_uri,thumbnail_url,download_state,download_error,download_progress,gallery_uri,export_state,export_error,exported_at,created_at,updated_at,started_at,execution_duration,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,sync_error,last_sync_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET prompt=excluded.prompt,status=excluded.status,resolution=excluded.resolution,duration=excluded.duration,seed=excluded.seed,images_json=excluded.images_json,audios_json=excluded.audios_json,video_url=excluded.video_url,created_at=excluded.created_at,updated_at=MAX(tasks.updated_at, excluded.updated_at),started_at=excluded.started_at,execution_duration=excluded.execution_duration,workflow_id=excluded.workflow_id,workflow_version=excluded.workflow_version,workflow_hash=excluded.workflow_hash,adapter_id=excluded.adapter_id,adapter_version=excluded.adapter_version,input_json=excluded.input_json,sync_error=excluded.sync_error,last_sync_at=excluded.last_sync_at', t.id, t.prompt, t.status, t.resolution, t.duration, t.seed ?? null, t.images ? JSON.stringify(t.images) : null, t.audios ? JSON.stringify(t.audios) : null, t.videoUrl ?? null, t.localUri ?? null, t.thumbnailUrl ?? null, t.downloadState ?? (t.localUri ? 'DOWNLOADED' : 'IDLE'), t.downloadError ?? null, t.downloadProgress ?? null, t.galleryUri ?? null, t.exportState ?? 'NOT_REQUESTED', t.exportError ?? null, t.exportedAt ?? null, t.createdAt, t.updatedAt, t.startedAt ?? null, t.executionDuration ?? null, t.workflowId ?? null, t.workflowVersion ?? null, t.workflowContentHash ?? null, t.adapterId ?? null, t.adapterVersion ?? null, t.inputSnapshot ? JSON.stringify(t.inputSnapshot) : null, t.syncError ?? null, t.lastSyncAt ?? null); },
    updateMediaProjection,
    async upsertMediaProjection(t: TaskRecord) { await updateMediaProjection(t.id, { localUri: t.localUri, thumbnailUrl: t.thumbnailUrl, downloadState: t.downloadState ?? (t.localUri ? 'DOWNLOADED' : 'IDLE'), downloadError: t.downloadError, downloadProgress: t.downloadProgress, galleryUri: t.galleryUri, exportState: t.exportState ?? 'NOT_REQUESTED', exportError: t.exportError, exportedAt: t.exportedAt, updatedAt: t.updatedAt }); },
    async list() { return (await all<any>('SELECT * FROM tasks ORDER BY created_at DESC')).map(map); },
    async get(id: string) {
      const row = await first<any>('SELECT * FROM tasks WHERE id = ? LIMIT 1', id);
      return row ? map(row) : undefined;
    },
    async listPage(options: TaskPageOptions = {}) {
      const limit = Math.max(1, Math.min(100, options.limit ?? 30));
      const query = options.query?.trim().toLowerCase() || undefined;
      const cursor = options.cursor;
      const rows = await all<any>('SELECT * FROM tasks WHERE (? IS NULL OR status = ?) AND (? IS NULL OR lower(prompt) LIKE ? OR lower(id) LIKE ?) AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?', options.status ?? null, options.status ?? null, query ?? null, query ? `%${query}%` : null, query ? `%${query}%` : null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(map);
      const last = items[items.length - 1];
      return { items, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : undefined };
    },
    async listUpdatedSince(watermark: number, limit = 200) { return (await all<any>('SELECT * FROM tasks WHERE updated_at > ? ORDER BY updated_at ASC, id ASC LIMIT ?', watermark, Math.max(1, Math.min(1000, limit)))).map(map); },
    async listActive() { return (await all<any>("SELECT * FROM tasks WHERE status IN ('QUEUED','RUNNING','UNKNOWN') ORDER BY updated_at ASC, id ASC")).map(map); },
    async listSyncCandidates() { return (await all<any>("SELECT * FROM tasks WHERE status IN ('SUCCESS','PARTIAL_SUCCESS') AND workflow_id IS NOT NULL AND last_sync_at IS NULL AND (started_at IS NULL OR (video_url IS NULL AND local_uri IS NULL AND gallery_uri IS NULL)) ORDER BY updated_at ASC, id ASC LIMIT 200")).map(map); },
    async listMediaPending() { return (await all<any>("SELECT * FROM tasks WHERE status IN ('SUCCESS','PARTIAL_SUCCESS') AND (video_url IS NOT NULL OR local_uri IS NOT NULL) AND (((download_state IN ('IDLE','DOWNLOADING')) AND download_error IS NULL) OR export_state IN ('QUEUED','EXPORTING')) ORDER BY updated_at ASC, id ASC LIMIT 40")).map(map); },
    async listMediaProjectionCandidates(limit = 200) { return (await all<any>("SELECT t.* FROM tasks t WHERE t.status IN ('SUCCESS','PARTIAL_SUCCESS') AND (t.video_url IS NOT NULL OR t.local_uri IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.task_id = t.id AND m.kind = 'video') ORDER BY t.updated_at ASC, t.id ASC LIMIT ?", Math.max(1, Math.min(1000, limit)))).map(map); },
    async remove(id: string) {
      assertAppDatabaseWritable(db);
      let rows: any[] = [];
      let assets: any[] = [];
      transaction(db, () => {
        const activeOperation = db.getFirstSync<{ id: string }>(
          "SELECT id FROM workflow_operations WHERE job_id=? AND state='CLAIMED' LIMIT 1",
          id,
        );
        if (activeOperation) throw new Error('TASK_OPERATION_IN_PROGRESS');
        rows = db.getAllSync<any>('SELECT local_uri, thumbnail_url FROM tasks WHERE id = ? LIMIT 1', id);
        assets = db.getAllSync<any>('SELECT local_path, poster_path FROM media_assets WHERE task_id = ?', id);
        db.runSync('DELETE FROM workflow_operations WHERE job_id = ?', id);
        db.runSync("DELETE FROM artifact_blob_refs WHERE owner_type='workflow_artifact' AND owner_id IN (SELECT job_id || ':' || id FROM workflow_artifacts WHERE job_id=?)", id);
        db.runSync('DELETE FROM media_deliveries WHERE asset_id IN (SELECT id FROM media_assets WHERE task_id = ?)', id);
        db.runSync('DELETE FROM media_assets WHERE task_id = ?', id);
        db.runSync('DELETE FROM workflow_artifacts WHERE job_id = ?', id);
        db.runSync('DELETE FROM workflow_jobs WHERE id = ?', id);
        db.runSync('DELETE FROM tasks WHERE id = ?', id);
      });
      for (const row of [...rows, ...assets]) {
        for (const uri of [row.local_uri, row.thumbnail_url, row.local_path, row.poster_path]) {
          if (typeof uri !== 'string' || !uri.startsWith('file://') || /\/cas\/sha256\//.test(uri)) continue;
          try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* best effort */ }
        }
      }
    },
  };
}
