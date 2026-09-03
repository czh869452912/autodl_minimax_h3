import type { MediaAsset, MediaStatus, MediaStore } from './types';
import * as FileSystem from 'expo-file-system/legacy';
import { assertAppDatabaseWritable } from '../storage/database';

type SqlDatabase = {
  execSync?: (source: string) => void;
  runSync?: (source: string, ...params: any[]) => unknown;
  getAllSync?: <T>(source: string, ...params: any[]) => T[];
};

type MediaPageOptions = { query?: string; status?: MediaStatus; kind?: MediaAsset['kind']; limit?: number; cursor?: { createdAt: number; id: string } };

const toAsset = (row: Record<string, unknown>): MediaAsset => ({
  id: String(row.id), taskId: String(row.task_id), title: String(row.title), prompt: String(row.prompt),
  sourceUrl: String(row.source_url), localPath: row.local_path ? String(row.local_path) : undefined,
  posterPath: row.poster_path ? String(row.poster_path) : undefined, mimeType: String(row.mime_type),
  width: row.width == null ? undefined : Number(row.width), height: row.height == null ? undefined : Number(row.height),
  durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms), status: row.status as MediaStatus,
  createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), exportStatus: row.export_status ? String(row.export_status) : undefined,
  artifactId: row.artifact_id ? String(row.artifact_id) : undefined, jobId: row.job_id ? String(row.job_id) : undefined, workflowId: row.workflow_id ? String(row.workflow_id) : undefined, kind: (row.kind as MediaAsset['kind']) || 'video',
});

async function removePrivateFile(uri: unknown): Promise<void> {
  const value = uri == null ? '' : String(uri);
  if (!value.startsWith('file://')) return;
  try { await FileSystem.deleteAsync(value, { idempotent: true }); } catch { /* best effort */ }
}

export function createSqliteMediaStore(database: SqlDatabase): MediaStore {
  const run = async (sql: string, ...params: any[]) => {
    assertAppDatabaseWritable(database as never);
    return typeof (database as any).runAsync === 'function' ? (database as any).runAsync(sql, ...params) : database.runSync?.(sql, ...params);
  };
  const all = async <T>(sql: string, ...params: any[]): Promise<T[]> => typeof (database as any).getAllAsync === 'function' ? ((await (database as any).getAllAsync(sql, ...params)) ?? []) : (database.getAllSync?.<T>(sql, ...params) ?? []);
  return {
    async upsert(asset) {
      await run('INSERT OR REPLACE INTO media_assets (id, task_id, title, prompt, source_url, local_path, poster_path, mime_type, width, height, duration_ms, status, created_at, updated_at, artifact_id, job_id, workflow_id, kind, export_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', asset.id, asset.taskId, asset.title, asset.prompt, asset.sourceUrl, asset.localPath ?? null, asset.posterPath ?? null, asset.mimeType, asset.width ?? null, asset.height ?? null, asset.durationMs ?? null, asset.status, asset.createdAt, asset.updatedAt, asset.artifactId ?? null, asset.jobId ?? null, asset.workflowId ?? null, asset.kind ?? 'video', asset.exportStatus ?? null);
    },
    async upsertArtifactProjection(asset) {
      await run("INSERT INTO media_assets (id, task_id, title, prompt, source_url, local_path, poster_path, mime_type, width, height, duration_ms, status, created_at, updated_at, artifact_id, job_id, workflow_id, kind, export_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,title=excluded.title,prompt=excluded.prompt,source_url=excluded.source_url,local_path=COALESCE(media_assets.local_path, excluded.local_path),poster_path=COALESCE(media_assets.poster_path, excluded.poster_path),mime_type=excluded.mime_type,width=COALESCE(excluded.width, media_assets.width),height=COALESCE(excluded.height, media_assets.height),duration_ms=COALESCE(excluded.duration_ms, media_assets.duration_ms),status=CASE WHEN media_assets.local_path IS NOT NULL OR media_assets.status = 'downloaded' THEN 'downloaded' ELSE excluded.status END,updated_at=MAX(media_assets.updated_at, excluded.updated_at),artifact_id=excluded.artifact_id,job_id=excluded.job_id,workflow_id=excluded.workflow_id,kind=excluded.kind,export_status=COALESCE(media_assets.export_status, excluded.export_status)", asset.id, asset.taskId, asset.title, asset.prompt, asset.sourceUrl, asset.localPath ?? null, asset.posterPath ?? null, asset.mimeType, asset.width ?? null, asset.height ?? null, asset.durationMs ?? null, asset.status, asset.createdAt, asset.updatedAt, asset.artifactId ?? null, asset.jobId ?? null, asset.workflowId ?? null, asset.kind ?? 'video', asset.exportStatus ?? null);
    },
    async list(options: { query?: string; status?: MediaStatus; kind?: MediaAsset['kind'] } = {}) {
      const query = options.query?.trim().toLowerCase() || undefined;
      const rows = await all<Record<string, unknown>>('SELECT * FROM media_assets WHERE (? IS NULL OR status = ?) AND (? IS NULL OR kind = ?) AND (? IS NULL OR lower(title) LIKE ? OR lower(prompt) LIKE ? OR lower(task_id) LIKE ?) ORDER BY created_at DESC', options.status ?? null, options.status ?? null, options.kind ?? null, options.kind ?? null, query ?? null, query ? `%${query}%` : null, query ? `%${query}%` : null, query ? `%${query}%` : null);
      return rows.map(toAsset);
    },
    async listPage(options: MediaPageOptions = {}) {
      const limit = Math.max(1, Math.min(100, options.limit ?? 40));
      const query = options.query?.trim().toLowerCase() || undefined;
      const cursor = options.cursor;
      const rows = await all<Record<string, unknown>>('SELECT id, task_id, title, prompt, source_url, local_path, poster_path, mime_type, width, height, duration_ms, status, created_at, updated_at, artifact_id, job_id, workflow_id, kind, export_status FROM media_assets WHERE (? IS NULL OR status = ?) AND (? IS NULL OR kind = ?) AND (? IS NULL OR lower(title) LIKE ? OR lower(prompt) LIKE ? OR lower(task_id) LIKE ?) AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?', options.status ?? null, options.status ?? null, options.kind ?? null, options.kind ?? null, query ?? null, query ? `%${query}%` : null, query ? `%${query}%` : null, query ? `%${query}%` : null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(toAsset);
      const last = items[items.length - 1];
      return { items, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : undefined };
    },
    async get(id) {
      const rows = await all<Record<string, unknown>>('SELECT * FROM media_assets WHERE id = ? LIMIT 1', id);
      return rows[0] ? toAsset(rows[0]) : null;
    },
    async getPrimaryVideoByTaskId(taskId) {
      const rows = await all<Record<string, unknown>>("SELECT * FROM media_assets WHERE task_id = ? AND kind = 'video' ORDER BY updated_at DESC, id ASC LIMIT 1", taskId);
      return rows[0] ? toAsset(rows[0]) : null;
    },
    async remove(id) { assertAppDatabaseWritable(database as never); const rows = database.getAllSync?.<Record<string, unknown>>('SELECT local_path, poster_path FROM media_assets WHERE id = ? LIMIT 1', id) ?? []; database.runSync?.('DELETE FROM media_deliveries WHERE asset_id = ?', id); database.runSync?.('DELETE FROM media_assets WHERE id = ?', id); for (const row of rows) for (const uri of [row.local_path, row.poster_path]) await removePrivateFile(uri); },
    async upsertDelivery(delivery) { assertAppDatabaseWritable(database as never); database.runSync?.('INSERT OR REPLACE INTO media_deliveries (id, asset_id, target, uri, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', delivery.id, delivery.assetId, delivery.target, delivery.uri ?? null, delivery.status, delivery.error ?? null, delivery.createdAt, delivery.updatedAt); database.runSync?.('UPDATE media_assets SET export_status = ?, updated_at = ? WHERE id = ?', delivery.status === 'EXPORTED' ? '已保存到相册' : delivery.status === 'FAILED' ? '保存到相册失败' : '正在保存到相册', delivery.updatedAt, delivery.assetId); },
    async listDeliveries(assetId) { const rows = database.getAllSync?.<Record<string, unknown>>('SELECT * FROM media_deliveries WHERE asset_id = ? ORDER BY created_at DESC', assetId) ?? []; return rows.map((row) => ({ id: String(row.id), assetId: String(row.asset_id), target: row.target as 'system-gallery' | 'share' | 'cloud', uri: row.uri ? String(row.uri) : undefined, status: row.status as 'QUEUED' | 'EXPORTING' | 'EXPORTED' | 'FAILED', error: row.error ? String(row.error) : undefined, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) })); },
  };
}
