import { readSettings } from '../settings/storage';
import { createJobRepository } from '../jobs/repository';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { withWriteTransaction } from '../storage/sqliteBusy';
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
    refreshArtifactSources: async taskId => {
      const task = await taskStore.get(taskId);
      if (!task || (task.downloadState !== 'DOWNLOAD_FAILED' && task.downloadState !== 'IDLE' && task.downloadState !== 'DOWNLOADED')) return;
      const job = await createJobRepository(db).get(taskId);
      if (!job?.providerHandle) return;
      const settings = await readSettings();
      const provider = createBuiltinProviderAdapters({ resolveCredential: kind => kind === 'autodl-token' ? settings.token : undefined }).get(job.adapterId);
      if (!provider) throw new Error('当前版本不支持此任务来源，请更新应用');
      const update = await provider.getStatus(job.providerHandle);
      if (!update.artifacts.length) throw new Error('服务端暂未返回可下载结果，请稍后重试');
      await withWriteTransaction(db, async tx => {
        for (const artifact of update.artifacts) {
          if (!artifact.uri) continue;
          await tx.runAsync('UPDATE workflow_artifacts SET uri=? WHERE job_id=? AND id=?', artifact.uri, taskId, artifact.id);
          await tx.runAsync('UPDATE media_assets SET source_url=? WHERE task_id=? AND artifact_id=?', artifact.uri, taskId, artifact.id);
        }
        const primary = update.artifacts.find(artifact => artifact.kind === 'video' && artifact.uri);
        if (primary) await tx.runAsync('UPDATE tasks SET video_url=? WHERE id=?', primary.uri!, taskId);
      });
    },
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
