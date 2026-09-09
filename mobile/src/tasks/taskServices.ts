import * as FileSystem from 'expo-file-system/legacy';
import type { AppDatabase } from '../storage/appDatabase';
import { assertAppDatabaseWritable } from '../storage/database';
import { getDatabase } from '../storage/databaseClient';
import { createTaskRepository } from './repository';
import { createSqliteMediaStore } from '../media/repository';
import { createTaskProjectionRepository } from './projectionRepository';
import { createTaskCommandService } from './taskCommandService';

function createTaskServices(db: AppDatabase) {
  const taskStore = createTaskRepository(db);
  const mediaStore = createSqliteMediaStore(db);
  const taskProjectionRepository = createTaskProjectionRepository(db);
  const taskCommandService = createTaskCommandService({
    db,
    fileExists: async uri => { const info = await FileSystem.getInfoAsync(uri); return info.exists && !info.isDirectory; },
    resolveCasUri: path => `${FileSystem.documentDirectory ?? ''}${path}`,
  });
  async function listActiveTaskIds(): Promise<string[]> {
    return (await db.getAllAsync<{ id: string }>(`SELECT id FROM tasks WHERE status IN ('QUEUED','RUNNING','UNKNOWN')
      OR download_state IN ('ENQUEUED','DOWNLOADING') OR export_state IN ('QUEUED','EXPORTING')`)).map(row => row.id);
  }

  return { taskStore, mediaStore, taskProjectionRepository, taskCommandService, listActiveTaskIds };
}
let shared: { db: AppDatabase; services: ReturnType<typeof createTaskServices> } | undefined;
export function getTaskServices() {
  const db = getDatabase();
  assertAppDatabaseWritable(db);
  if (!shared || shared.db !== db) shared = { db, services: createTaskServices(db) };
  return shared.services;
}
