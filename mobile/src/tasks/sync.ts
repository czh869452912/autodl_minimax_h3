import { readSettings } from '../settings/storage';
import { getDatabase } from '../storage/databaseClient';
import { getAppRecoveryState } from '../storage/database';
import { createTaskRepository } from './repository';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createJobStateRepository } from '../workflows/executor/jobStateRepository';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createDurableExecutor } from '../workflows/executor/durableExecutor';
import { createExecutorTick, type TickOptions } from '../workflows/executor/tick';
import { createExecutorCycle, type CycleOptions, type CycleSummary } from '../workflows/executor/cycle';
import { createArtifactCas } from '../media/cas';
import { createCasRepository } from '../media/casRepository';
import { createSqliteArtifactCommitter, handleArtifactDownload } from '../workflows/executor/artifactOperation';
import { DEFAULT_VIDEO_DOWNLOAD_BYTES } from './downloadPolicy';
import { jobToTaskProjection } from './projection';
import type { WorkflowOperation } from '../workflows/executor/types';
import { createSqliteMediaStore } from '../media/repository';
import { materializeJobArtifacts } from '../media/materializer';
import type { ArtifactRecord } from '../jobs/types';

const database = getDatabase();
export const taskStore = createTaskRepository(database);
export const mediaStore = createSqliteMediaStore(database);
const compatibilityJobs = createJobRepository(database);
const jobs = createJobStateRepository(database);
const operations = createOperationRepository(database);
const blobs = createCasRepository(database);
const cas = createArtifactCas();
const commitArtifact = createSqliteArtifactCommitter(database);

async function executorForCurrentSettings() {
  const settings = await readSettings();
  const adapters = createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? settings.token : undefined });
  const runtime = createWorkflowRuntime({
    adapters,
    jobs: compatibilityJobs,
    credentials: { get: async () => ({ ok: Boolean(settings.token) }) },
    id: () => `compat-${Date.now()}`,
  });
  return {
    settings,
    adapters,
    durable: createDurableExecutor({ jobs, operations, runtime, adapters, credentials: { get: async () => ({ ok: Boolean(settings.token) }) } }),
  };
}

const executor = {
  async recover(now: number) { await (await executorForCurrentSettings()).durable.recover(now); },
  async handle(operation: WorkflowOperation, owner: string) {
    const current = await executorForCurrentSettings();
    if (operation.kind !== 'ARTIFACT_DOWNLOAD') return current.durable.handle(operation, owner);
    await handleArtifactDownload(operation, owner, {
      operations,
      blobs,
      cas,
      commit: commitArtifact,
      deliveryPolicy: {
        autoExportToGallery: current.settings.autoExportToGallery,
        keepPrivateCopy: current.settings.keepPrivateCopy,
      },
      updateProjection: async () => undefined,
      async ensureProjection(jobId, artifact) {
        const job = jobs.get(jobId);
        const task = await taskStore.get(jobId);
        if (!job) throw new Error('JOB_NOT_FOUND');
        if (!task) throw new Error('TASK_NOT_FOUND');
        await materializeJobArtifacts(job, [artifact], mediaStore, task);
      },
      async updateDownloadState(state, errorCode) {
        if (!operation.jobId) throw new Error('JOB_ID_MISSING');
        const artifact = operation.payload.artifact as ArtifactRecord | undefined;
        if (!artifact?.id) throw new Error('ARTIFACT_INPUT_INVALID');
        const timestamp = Date.now();
        const taskUpdated = await taskStore.updateMediaProjection(operation.jobId, {
          downloadState: state,
          downloadError: errorCode,
          downloadProgress: state === 'ENQUEUED' || state === 'DOWNLOADING' ? 0 : undefined,
          updatedAt: timestamp,
        });
        if (!taskUpdated) throw new Error('TASK_NOT_FOUND');
        const asset = await mediaStore.get(`${operation.jobId}:${artifact.id}`);
        if (!asset) throw new Error('MEDIA_ASSET_NOT_FOUND');
        await mediaStore.upsertArtifactProjection?.({
          ...asset,
          status: state === 'ENQUEUED' ? 'queued' : state === 'DOWNLOADING' ? 'downloading' : 'failed',
          updatedAt: timestamp,
        });
      },
      policy(jobId) {
        const job = jobs.get(jobId);
        const policy = job ? current.adapters.get(job.adapterId)?.manifest().artifactDownloadPolicy : undefined;
        return {
          allowedHosts: policy?.allowedHosts ?? [],
          allowProviderSuppliedPublicHosts: policy?.allowProviderSuppliedPublicHosts,
          acceptedMimes: policy?.acceptedMimes,
          maxBytes: policy?.maxBytes ?? DEFAULT_VIDEO_DOWNLOAD_BYTES,
          connectTimeoutMs: policy?.connectTimeoutMs ?? policy?.timeoutMs,
          idleTimeoutMs: policy?.idleTimeoutMs ?? policy?.timeoutMs,
        };
      },
    });
  },
};

const tick = createExecutorTick({
  operations,
  executor,
  owner: () => `app-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  isReadonly: () => Boolean(getAppRecoveryState(database)),
});
const cycle = createExecutorCycle({ runTick: (options) => tick.run(options) });

async function repairTaskProjections(limit = 32): Promise<number> {
  const persisted = (await compatibilityJobs.list()).slice(0, limit);
  let updated = 0;
  for (const job of persisted) {
    const previous = await taskStore.get(job.id);
    const artifacts = await compatibilityJobs.listArtifacts(job.id);
    const projection = jobToTaskProjection(job, artifacts, previous);
    if (!previous || previous.status !== projection.status || previous.updatedAt < projection.updatedAt) {
      await taskStore.upsertWorkflowProjection(projection);
      updated += 1;
    }
  }
  return updated;
}

export type SyncSummary = { updated: number; failed: number; skipped: number; remaining: number; lastSyncAt: number; operations: CycleSummary };

export function createSyncTaskRunner(deps: {
  runCycle(options: CycleOptions): Promise<CycleSummary>;
  repair(): Promise<number>;
  listTasks(): ReturnType<typeof taskStore.listActive>;
  now(): number;
}) {
  return async (reason: TickOptions['reason'] = 'foreground') => {
    const operationSummary = await deps.runCycle({ reason });
    const updated = await deps.repair();
    const tasks = await deps.listTasks();
    return {
      tasks,
      summary: {
        updated,
        failed: operationSummary.failed,
        skipped: operationSummary.blocked,
        remaining: operationSummary.remainingDue + operationSummary.remainingScheduled,
        lastSyncAt: deps.now(),
        operations: operationSummary,
      } satisfies SyncSummary,
    };
  };
}

const run = createSyncTaskRunner({
  runCycle: (options) => cycle.run(options),
  repair: () => repairTaskProjections(),
  listTasks: () => taskStore.listActive(),
  now: Date.now,
});

export async function syncTaskRun(reason: TickOptions['reason'] = 'foreground', _taskIds?: string[]) {
  return run(reason);
}

export async function syncTasks() { return (await syncTaskRun()).tasks; }
