import type { SQLiteDatabase } from 'expo-sqlite';
import type { TaskRecord } from './types';
import * as FileSystem from 'expo-file-system/legacy';

const schema = `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, duration INTEGER NOT NULL, seed TEXT, images_json TEXT, audios_json TEXT, video_url TEXT, local_uri TEXT, thumbnail_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`;
export function createTaskRepository(db: SQLiteDatabase) {
  db.execSync(schema);
  const map = (r: any): TaskRecord => ({ id: r.id, prompt: r.prompt, status: r.status, resolution: r.resolution, duration: Number(r.duration), seed: r.seed || undefined, images: r.images_json ? JSON.parse(r.images_json) : undefined, audios: r.audios_json ? JSON.parse(r.audios_json) : undefined, videoUrl: r.video_url || undefined, localUri: r.local_uri || undefined, thumbnailUrl: r.thumbnail_url || undefined, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) });
  return {
    async upsert(t: TaskRecord) { db.runSync('INSERT OR REPLACE INTO tasks (id,prompt,status,resolution,duration,seed,images_json,audios_json,video_url,local_uri,thumbnail_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', t.id, t.prompt, t.status, t.resolution, t.duration, t.seed ?? null, t.images ? JSON.stringify(t.images) : null, t.audios ? JSON.stringify(t.audios) : null, t.videoUrl ?? null, t.localUri ?? null, t.thumbnailUrl ?? null, t.createdAt, t.updatedAt); },
    async list() { return (db.getAllSync<any>('SELECT * FROM tasks ORDER BY created_at DESC') ?? []).map(map); },
    async remove(id: string) { const rows = db.getAllSync<any>('SELECT local_uri, thumbnail_url FROM tasks WHERE id = ? LIMIT 1', id); db.runSync('DELETE FROM tasks WHERE id = ?', id); for (const row of rows) { for (const uri of [row.local_uri, row.thumbnail_url]) { if (uri) { try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {} } } } },
  };
}
