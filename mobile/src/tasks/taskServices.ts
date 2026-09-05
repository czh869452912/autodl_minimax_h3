import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../storage/databaseClient';
import { createTaskRepository } from './repository';
import { createSqliteMediaStore } from '../media/repository';
import { createTaskProjectionRepository } from './projectionRepository';
import { createTaskCommandService } from './taskCommandService';

const db = getDatabase();
export const taskStore = createTaskRepository(db);
export const mediaStore = createSqliteMediaStore(db);
export const taskProjectionRepository = createTaskProjectionRepository(db);
export const taskCommandService = createTaskCommandService({
  db,
  fileExists: async uri => { const info = await FileSystem.getInfoAsync(uri); return info.exists && !info.isDirectory; },
  resolveCasUri: path => `${FileSystem.documentDirectory ?? ''}${path}`,
});
export async function listActiveTaskIds(): Promise<string[]> {
  return (await db.getAllAsync<{ id: string }>(`SELECT id FROM tasks WHERE status IN ('QUEUED','RUNNING','UNKNOWN')
    OR download_state IN ('ENQUEUED','DOWNLOADING') OR export_state IN ('QUEUED','EXPORTING')`)).map(row => row.id);
}
