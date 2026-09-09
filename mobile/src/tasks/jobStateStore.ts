import type { AppDatabase } from '../storage/appDatabase';
import { createJobStateRepository as createJobStateCore } from '../workflows/executor/jobStateRepository';
import { createTaskRepository } from './repository';
import { jobToTaskProjection } from './projection';

// Application composition: execution facts and the task read model commit on
// the same connection. The core never imports the task repository or UI.
export function createJobStateRepository(db: AppDatabase) {
  return createJobStateCore(db, async ({ tx, job, artifacts, created }) => {
    const tasks = createTaskRepository(tx);
    const previous = created ? undefined : await tasks.get(job.id);
    await tasks.upsertWorkflowProjection(jobToTaskProjection(job, artifacts, previous));
  });
}
export type JobStateRepository = ReturnType<typeof createJobStateRepository>;
