import type { ArtifactRecord, JobRecord } from '../jobs/types';
import type { TaskRecord } from '../tasks/types';
import { materializeJobArtifacts } from './materializer';
import type { MediaStore } from './types';

type CatalogTaskStore = {
  listMediaProjectionCandidates?(limit?: number): Promise<TaskRecord[]>;
};

type CatalogJobStore = {
  get(id: string): Promise<JobRecord | undefined>;
  listArtifacts(jobId: string): Promise<ArtifactRecord[]>;
};

export async function reconcileMediaCatalog({
  taskStore,
  jobStore,
  mediaStore,
  limit = 200,
}: {
  taskStore: CatalogTaskStore;
  jobStore: CatalogJobStore;
  mediaStore: Pick<MediaStore, 'upsert'>;
  limit?: number;
}): Promise<{ scanned: number; materialized: number }> {
  const tasks = taskStore.listMediaProjectionCandidates ? await taskStore.listMediaProjectionCandidates(limit) : [];
  let materialized = 0;
  for (const task of tasks) {
    const job = await jobStore.get(task.id);
    const artifacts = job ? await jobStore.listArtifacts(job.id) : [];
    if (job && artifacts.length) {
      materialized += (await materializeJobArtifacts(job, artifacts, mediaStore, task)).length;
    }
  }
  return { scanned: tasks.length, materialized };
}
