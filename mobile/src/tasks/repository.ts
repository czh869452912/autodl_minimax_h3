import type { SQLiteDatabase } from 'expo-sqlite';
import type { TaskRecord } from './types';

const schema = `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, duration INTEGER NOT NULL, video_url TEXT, local_uri TEXT, thumbnail_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`;
export function createTaskRepository(db: SQLiteDatabase) {
  db.execSync(schema);
  const map = (r: any): TaskRecord => ({ id: r.id, prompt: r.prompt, status: r.status, resolution: r.resolution, duration: Number(r.duration), videoUrl: r.video_url || undefined, localUri: r.local_uri || undefined, thumbnailUrl: r.thumbnail_url || undefined, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) });
  return {
    async upsert(t: TaskRecord) { db.runSync('INSERT OR REPLACE INTO tasks (id,prompt,status,resolution,duration,video_url,local_uri,thumbnail_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', t.id, t.prompt, t.status, t.resolution, t.duration, t.videoUrl ?? null, t.localUri ?? null, t.thumbnailUrl ?? null, t.createdAt, t.updatedAt); },
    async list() { return (db.getAllSync<any>('SELECT * FROM tasks ORDER BY created_at DESC') ?? []).map(map); },
    async remove(id: string) { db.runSync('DELETE FROM tasks WHERE id = ?', id); },
  };
}
