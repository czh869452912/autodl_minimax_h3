import { readSettings } from '../settings/storage';
import { getDatabase } from '../storage/databaseClient';
import { getAppRecoveryStateAsync } from '../storage/database';
import { createTaskRepository } from './repository';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createJobStateRepository } from '../workflows/executor/jobStateRepository';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createDurableExecutor } from '../workflows/executor/durableExecutor';
import { createExecutorTick } from '../workflows/executor/tick';
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
import { assertLocalExportSource, createSqliteExportStore, handleExport } from '../workflows/executor/exportOperation';
import { exportVideo, probeVideo } from '../native/media';
import * as FileSystem from 'expo-file-system/legacy';
import { removeCasPath } from '../media/cas';
import { EMPTY_RECONCILIATION_SUMMARY, reconcileMediaState, type ReconciliationSummary } from '../media/reconciliation';
import { createMediaCommandService, type MediaCommandService } from '../workflows/executor/mediaCommandService';
import { claimMaintenanceWindow, createExecutorSettingsCache, type SyncRequest } from './syncPolicy';
import type { PendingSummary } from '../workflows/executor/operationRepository';
import { resumeAfterConnectivityReturns } from './networkRecovery';
import { projectTerminalNotifications, type TerminalNotification } from './terminalEvents';

const database = getDatabase();
export const taskStore = createTaskRepository(database);
export const mediaStore = createSqliteMediaStore(database);
const compatibilityJobs = createJobRepository(database);
const jobs = createJobStateRepository(database);
const operations = createOperationRepository(database);
const blobs = createCasRepository(database);
const cas = createArtifactCas();
const commitArtifact = createSqliteArtifactCommitter(database);
const exportStore = createSqliteExportStore(database);

const executorSettingsCache = createExecutorSettingsCache((settings) => {
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
});

const executor = {
  async recover(now: number) { await (await executorForCurrentSettings()).durable.recover(now); },
  async handle(operation: WorkflowOperation, owner: string) {
    const current = await executorForCurrentSettings();
    if (operation.kind === 'EXPORT') {
      await handleExport(operation, owner, {
        now: Date.now,
        assertSource: assertLocalExportSource,
        markExporting: exportStore.markExporting,
        canPublish: exportStore.canPublish,
        publish: exportVideo,
        commitSuccess: exportStore.commitSuccess,
        retry: exportStore.retry,
        finishFailure: exportStore.finishFailure,
        removeLegacyPrivate: (sourceUri) => FileSystem.deleteAsync(sourceUri, { idempotent: true }),
      });
      return;
    }
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
      verifyVideo: probeVideo,
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
  isReadonly: async () => Boolean(await getAppRecoveryStateAsync(database)),
});
const cycle = createExecutorCycle({ runTick: (options) => tick.run(options) });

export function createMediaCommandFacade(
  commands: Pick<MediaCommandService, 'requestDownload' | 'requestRedownload' | 'requestExport'>,
  runCycle: (options: CycleOptions) => Promise<CycleSummary>,
) {
  return {
    async requestTaskDownload(taskId: string) {
      const result = await commands.requestDownload(taskId);
      if (result.status !== 'already-complete') await runCycle({ reason: 'foreground' });
      return result;
    },
    async requestTaskExport(taskId: string, policy: { keepPrivateCopy: boolean }) {
      const result = await commands.requestExport(taskId, policy);
      if (result.status !== 'already-complete') await runCycle({ reason: 'foreground' });
      return result;
    },
    async requestTaskRedownload(taskId: string) {
      const result = await commands.requestRedownload(taskId);
      if (result.status !== 'already-complete') await runCycle({ reason: 'foreground' });
      return result;
    },
  };
}

async function executorForCurrentSettings() {
  return executorSettingsCache.getOrCreate(await readSettings());
}

const mediaCommands = createMediaCommandService({
  db: database,
  fileExists: async (uri) => {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory;
  },
  resolveCasUri: (relativePath) => `${FileSystem.documentDirectory ?? ''}${relativePath}`,
});
const mediaCommandFacade = createMediaCommandFacade(mediaCommands, (options) => cycle.run(options));

export const requestTaskDownload = mediaCommandFacade.requestTaskDownload;
export const requestTaskExport = mediaCommandFacade.requestTaskExport;
export const requestTaskRedownload = mediaCommandFacade.requestTaskRedownload;

async function repairTaskProjections(limit = 32): Promise<number> {
  const persisted = await compatibilityJobs.listRecent(limit);
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

export type SyncSummary = {
  updated: number;
  failed: number;
  skipped: number;
  remaining: number;
  lastSyncAt: number;
  operations: CycleSummary;
  reconciliation: ReconciliationSummary;
  maintenanceRan: boolean;
  terminalEvents: TerminalNotification[];
  nextWakeAt?: number;
};

export function createSyncTaskRunner(deps: {
  runCycle(options: CycleOptions): Promise<CycleSummary>;
  repair(): Promise<number>;
  reconcile(): Promise<ReconciliationSummary>;
  listTasks(): ReturnType<typeof taskStore.listActive>;
  pendingSummary(options: { now: number; jobIds?: string[] }): Promise<PendingSummary>;
  countOutstanding(jobIds: string[]): Promise<number>;
  claimMaintenance(force: boolean): boolean;
  listTerminalEvents(jobIds: string[]): Parameters<typeof projectTerminalNotifications>[0];
  now(): number;
}) {
  return async (request: SyncRequest) => {
    const timestamp = deps.now();
    const operationSummary = await deps.runCycle({ reason: request.reason });
    const maintenanceRan = request.mode === 'maintenance' && deps.claimMaintenance(Boolean(request.forceMaintenance));
    const updated = maintenanceRan ? await deps.repair() : 0;
    const reconciliation = maintenanceRan ? await deps.reconcile() : EMPTY_RECONCILIATION_SUMMARY;
    const tasks = await deps.listTasks();
    const serviceIds = request.mode === 'service' ? request.taskIds ?? [] : [];
    const pending = await deps.pendingSummary({ now: timestamp, ...(request.mode === 'service' ? { jobIds: serviceIds } : {}) });
    const serviceIdSet = request.mode === 'service' ? new Set(serviceIds) : undefined;
    const remaining = request.mode === 'service'
      ? tasks.filter((task) => serviceIdSet!.has(task.id)).length + await deps.countOutstanding(serviceIds)
      : pending.remainingDue + pending.remainingScheduled;
    const terminalEvents = request.mode === 'service' ? projectTerminalNotifications(deps.listTerminalEvents(serviceIds)) : [];
    return {
      tasks,
      summary: {
        updated,
        failed: operationSummary.failed,
        skipped: operationSummary.blocked,
        remaining,
        lastSyncAt: timestamp,
        operations: operationSummary,
        reconciliation,
        maintenanceRan,
        terminalEvents,
        ...(pending.nextWakeAt == null ? {} : { nextWakeAt: pending.nextWakeAt }),
      } satisfies SyncSummary,
    };
  };
}

const run = createSyncTaskRunner({
  runCycle: (options) => cycle.run(options),
  repair: () => repairTaskProjections(),
  reconcile: () => reconcileMediaState({
    db: database,
    fileExists: async (uri) => {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists && !info.isDirectory;
    },
    removeCasPath,
  }),
  listTasks: () => taskStore.listActive(),
  pendingSummary: (options) => operations.pendingSummary(options),
  countOutstanding: (jobIds) => operations.countOutstanding(jobIds),
  claimMaintenance: (force) => claimMaintenanceWindow(database, Date.now(), force),
  listTerminalEvents: (jobIds) => jobs.listTerminalEvents(jobIds),
  now: Date.now,
});

export async function syncTaskRun(request: SyncRequest) {
  return run(request);
}

export async function resumeTaskSyncAfterReconnect() {
  return resumeAfterConnectivityReturns({
    listActiveJobIds: async () => (await compatibilityJobs.listActive!()).map((job) => job.id),
    expediteRetryableNetwork: (jobIds, now) => operations.expediteRetryableNetwork(jobIds, now),
    runPoll: run,
    now: Date.now,
  });
}

export async function syncTasks() { return (await syncTaskRun({ reason: 'foreground', mode: 'maintenance' })).tasks; }
