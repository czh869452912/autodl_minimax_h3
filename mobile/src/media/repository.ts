import type { MediaAsset, MediaStatus, MediaStore } from './types';
import * as FileSystem from 'expo-file-system/legacy';

type SqlDatabase = {
  execSync?: (source: string) => void;
  runSync?: (source: string, ...params: any[]) => unknown;
  getAllSync?: <T>(source: string, ...params: any[]) => T[];
};

const schema = `CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL,
  source_url TEXT NOT NULL, local_path TEXT, poster_path TEXT, mime_type TEXT NOT NULL,
  width INTEGER, height INTEGER, duration_ms INTEGER, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at DESC);`;
type MediaPageOptions = { query?: string; status?: MediaStatus; limit?: number; cursor?: { createdAt: number; id: string } };

const toAsset = (row: Record<string, unknown>): MediaAsset => ({
  id: String(row.id), taskId: String(row.task_id), title: String(row.title), prompt: String(row.prompt),
  sourceUrl: String(row.source_url), localPath: row.local_path ? String(row.local_path) : undefined,
  posterPath: row.poster_path ? String(row.poster_path) : undefined, mimeType: String(row.mime_type),
  width: row.width == null ? undefined : Number(row.width), height: row.height == null ? undefined : Number(row.height),
  durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms), status: row.status as MediaStatus,
  createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
});

export function createSqliteMediaStore(database: SqlDatabase): MediaStore {
  database.execSync?.(schema);
  database.execSync?.('CREATE INDEX IF NOT EXISTS idx_media_assets_status_created_id ON media_assets(status, created_at DESC, id DESC);');
  return {
    async upsert(asset) {
      database.runSync?.('INSERT OR REPLACE INTO media_assets (id, task_id, title, prompt, source_url, local_path, poster_path, mime_type, width, height, duration_ms, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', asset.id, asset.taskId, asset.title, asset.prompt, asset.sourceUrl, asset.localPath ?? null, asset.posterPath ?? null, asset.mimeType, asset.width ?? null, asset.height ?? null, asset.durationMs ?? null, asset.status, asset.createdAt, asset.updatedAt);
    },
    async list(options = {}) {
      const query = options.query?.trim().toLowerCase();
      const rows = database.getAllSync?.<Record<string, unknown>>('SELECT * FROM media_assets WHERE (? IS NULL OR status = ?) AND (? IS NULL OR lower(title) LIKE ? OR lower(prompt) LIKE ? OR lower(task_id) LIKE ?) ORDER BY created_at DESC', options.status ?? null, options.status ?? null, query ?? null, query ? `%${query}%` : null, query ? `%${query}%` : null, query ? `%${query}%` : null) ?? [];
      return rows.map(toAsset);
    },
    async listPage(options: MediaPageOptions = {}) {
      const limit = Math.max(1, Math.min(100, options.limit ?? 40));
      const query = options.query?.trim().toLowerCase();
      const cursor = options.cursor;
      const rows = database.getAllSync?.<Record<string, unknown>>('SELECT id, task_id, title, prompt, source_url, local_path, poster_path, mime_type, width, height, duration_ms, status, created_at, updated_at FROM media_assets WHERE (? IS NULL OR status = ?) AND (? IS NULL OR lower(title) LIKE ? OR lower(prompt) LIKE ? OR lower(task_id) LIKE ?) AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?', options.status ?? null, options.status ?? null, query ?? null, query ? `%${query}%` : null, query ? `%${query}%` : null, query ? `%${query}%` : null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1) ?? [];
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(toAsset);
      const last = items[items.length - 1];
      return { items, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : undefined };
    },
    async get(id) {
      const rows = database.getAllSync?.<Record<string, unknown>>('SELECT * FROM media_assets WHERE id = ? LIMIT 1', id) ?? [];
      return rows[0] ? toAsset(rows[0]) : null;
    },
    async remove(id) { const rows = database.getAllSync?.<Record<string, unknown>>('SELECT local_path, poster_path FROM media_assets WHERE id = ? LIMIT 1', id) ?? []; database.runSync?.('DELETE FROM media_assets WHERE id = ?', id); for (const row of rows) for (const uri of [row.local_path, row.poster_path]) if (uri) { try { await FileSystem.deleteAsync(String(uri), { idempotent: true }); } catch {} } },
  };
}
