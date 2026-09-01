import type { JobRecord, JobRepository } from '../jobs/types';
import type { TaskRecord } from './types';
import { jobToTaskProjection } from './projection';
import type { MediaStore } from '../media/types';
import { materializeJobArtifacts } from '../media/materializer';

type Settings = { token: string; autoExportToGallery: boolean; keepPrivateCopy: boolean };
type TaskStore = { list(): Promise<TaskRecord[]>; listActive?(): Promise<TaskRecord[]>; listSyncCandidates?(): Promise<TaskRecord[]>; listMediaPending?(): Promise<TaskRecord[]>; upsert(task: TaskRecord): Promise<void> };
type Runtime = { sync(job: JobRecord): Promise<JobRecord> };
type CoordinatorDeps = {
  readSettings(): Promise<Settings>;
  taskStore: TaskStore;
  jobStore: Pick<JobRepository, 'get' | 'list' | 'listArtifacts' | 'upsert'> & { listActive?: () => Promise<JobRecord[]> };
  createRuntime(token: string): Runtime;
  ensureMedia(task: TaskRecord, settings: Settings, onUpdate: (patch: Partial<TaskRecord>) => Promise<void>): Promise<unknown>;
  mediaStore?: Pick<MediaStore, 'upsert'> & Partial<Pick<MediaStore, 'upsertDelivery'>>;
  now?: () => number;
  concurrency?: number;
};
export type SyncSummary = { updated: number; failed: number; skipped: number; remaining: number; lastSyncAt?: number };
export type TaskSyncCoordinator = { run(options?: { reason?: 'foreground' | 'background' | 'service' }): Promise<{ tasks: TaskRecord[]; summary: SyncSummary }> };

export function createTaskSyncCoordinator(deps: CoordinatorDeps): TaskSyncCoordinator {
  let inFlight: Promise<{ tasks: TaskRecord[]; summary: SyncSummary }> | undefined;
  const now = deps.now ?? Date.now;
  const concurrency = Math.max(1, deps.concurrency ?? 4);
  const runOnce = async (): Promise<{ tasks: TaskRecord[]; summary: SyncSummary }> => {
    const settings = await deps.readSettings();
    const persistedJobs = deps.jobStore.listActive ? await deps.jobStore.listActive() : await deps.jobStore.list();
    const tasks = await (deps.taskStore.listActive ? deps.taskStore.listActive() : deps.taskStore.list());
    const activeById = new Map(persistedJobs.map((job) => [job.id, job]));
    for (const job of persistedJobs) {
      if (tasks.some((task) => task.id === job.id)) continue;
      const artifacts = await deps.jobStore.listArtifacts(job.id);
      const recovered = jobToTaskProjection(job, artifacts);
      await deps.taskStore.upsert(recovered);
      tasks.push(recovered);
    }
    const active = tasks.filter((item) => item.status === 'QUEUED' || item.status === 'RUNNING' || item.status === 'UNKNOWN');
    const repair = deps.taskStore.listSyncCandidates ? await deps.taskStore.listSyncCandidates() : [];
    const targets = [...active, ...repair.filter((item) => !active.some((current) => current.id === item.id))];
    const summary: SyncSummary = { updated: 0, failed: 0, skipped: 0, remaining: active.length };
    if (!settings.token) summary.skipped = active.length;
    if (settings.token) {
      const runtime = deps.createRuntime(settings.token);
      let cursor = 0;
      const worker = async () => {
      while (cursor < targets.length) {
        const index = cursor++;
        const previous = targets[index];
        try {
          const persistedJob = activeById.get(previous.id) ?? await deps.jobStore.get(previous.id);
          let updatedTask: TaskRecord;
          if (persistedJob?.remote?.providerJobId) {
            const updatedJob = await runtime.sync(persistedJob);
            const artifacts = await deps.jobStore.listArtifacts(updatedJob.id);
            updatedTask = { ...jobToTaskProjection(updatedJob, artifacts, previous), syncError: undefined, lastSyncAt: now() };
            if (deps.mediaStore) {
              await materializeJobArtifacts(updatedJob, artifacts, deps.mediaStore, updatedTask);
            }
          } else throw new Error('Workflow job missing for task');
          await deps.taskStore.upsert(updatedTask);
          summary.updated += 1;
          if (updatedTask.status !== 'QUEUED' && updatedTask.status !== 'RUNNING' && updatedTask.status !== 'UNKNOWN') {
            summary.remaining = Math.max(0, summary.remaining - 1);
          }
        } catch (error) {
          summary.failed += 1;
          await deps.taskStore.upsert({ ...previous, syncError: error instanceof Error ? error.message : String(error), lastSyncAt: now(), updatedAt: now() });
        }
      }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
    }
    const currentTasks = await (deps.taskStore.listMediaPending ? deps.taskStore.listMediaPending() : deps.taskStore.list());
    for (const task of currentTasks.filter((item) => {
      const downloadPending = (item.downloadState === undefined || item.downloadState === 'IDLE' || item.downloadState === 'DOWNLOADING') && !item.downloadError;
      const exportPending = item.exportState === 'QUEUED' || item.exportState === 'EXPORTING';
      return (item.status === 'SUCCESS' || item.status === 'PARTIAL_SUCCESS') && (item.videoUrl || item.localUri) && (downloadPending || exportPending);
    })) {
      try { let current = task; await deps.ensureMedia(task, settings, async (patch) => { current = { ...current, ...patch }; await deps.taskStore.upsert(current); }); if (deps.mediaStore) { const job = await deps.jobStore.get(current.id); const artifacts = job ? await deps.jobStore.listArtifacts(job.id) : []; if (job && artifacts.length) await materializeJobArtifacts(job, artifacts, deps.mediaStore, current); const primary = artifacts.find((artifact) => artifact.kind === 'video') ?? artifacts[0]; const assetId = job && primary ? `${job.id}:${primary.id}` : current.id; if (current.exportState === 'EXPORTED' && current.galleryUri) await deps.mediaStore.upsertDelivery?.({ id: `${assetId}:system-gallery`, assetId, target: 'system-gallery', uri: current.galleryUri, status: 'EXPORTED', createdAt: current.exportedAt ?? now(), updatedAt: now() }); } } catch { /* media delivery remains retryable via its persisted state */ }
    }
    summary.lastSyncAt = now();
    return { tasks: await deps.taskStore.listActive?.() ?? tasks, summary };
  };
  return {
    run() {
      if (!inFlight) inFlight = runOnce().finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}
