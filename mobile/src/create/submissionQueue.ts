import type { JobRecord } from '../jobs/types';
import type { TaskMediaInput, TaskRecord } from '../tasks/types';
import { jobToTaskProjection } from '../tasks/projection';
import type { QueueSubmissionInput } from '../workflows/runtime/runtime';

type QueueSubmissionDeps = {
  queueSubmission(input: QueueSubmissionInput): Promise<JobRecord>;
  upsertTask(task: TaskRecord): Promise<void>;
  foregroundTick(): void | Promise<unknown>;
};

export async function queueCreateFormSubmission(
  deps: QueueSubmissionDeps,
  input: QueueSubmissionInput,
  media: { images: TaskMediaInput[]; audios: TaskMediaInput[] },
): Promise<TaskRecord> {
  const job = await deps.queueSubmission(input);
  const task = { ...jobToTaskProjection(job, []), ...media };
  await deps.upsertTask(task);
  try {
    const tick = deps.foregroundTick();
    if (tick && typeof (tick as Promise<unknown>).catch === 'function') void (tick as Promise<unknown>).catch(() => undefined);
  } catch {
    // Queue persistence succeeded; a later app/background tick will retry execution.
  }
  return task;
}
