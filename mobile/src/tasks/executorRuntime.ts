import { readPendingMaintenance } from '../storage/pendingMaintenance';
import { creativeAccounts } from '../creative/accountRuntime';
import { readCreativeJobBinding, bindCreativeAdapter } from '../creative/boundExecution';
import { createCreativeBudget } from '../creative/budget';
import { archiveCreativeOutput } from '../creative/archiveOutput';
import { executeCreativeExport } from '../creative/exportExecution';
import { exportCreativeImage, lookupCreativeImage } from '../native/creativeMedia';
import { retireVideoConversion } from '../media/retireVideoConversion';
import { readSettings } from '../settings/storage';
import { artifactNetworkMessage } from '../workflows/executor/artifactErrors';
import { getDatabase } from '../storage/databaseClient';
import { getAppRecoveryStateAsync, assertAppDatabaseWritableAsync } from '../storage/database';
import type { AppDatabase } from '../storage/appDatabase';
import type { ExecutorRunner } from './executorRunner';
import { createTaskRepository } from './repository';
import { createJobRepository } from '../jobs/repository';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createJobStateRepository } from './jobStateStore';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createDurableExecutor } from '../workflows/executor/durableExecutor';
import { createExecutorTick } from '../workflows/executor/tick';
import { createExecutorCycle } from '../workflows/executor/cycle';
import { createArtifactCas } from '../media/cas';
import { createCasRepository } from '../media/casRepository';
import { createSqliteArtifactCommitter, handleArtifactDownload } from '../workflows/executor/artifactOperation';
import { normalizeArtifactDownloadPolicy } from '../workflows/providers/downloadPolicy';
import { jobToTaskProjection } from './projection';
import type { WorkflowOperation } from '../workflows/executor/types';
import { createSqliteMediaStore } from '../media/repository';
import { materializeJobArtifacts } from '../media/materializer';
import type { ArtifactRecord } from '../jobs/types';
import { assertLocalExportSource, createSqliteExportStore, handleExport } from '../workflows/executor/exportOperation';
import { exportVideo, probeVideoStructure, sha256File } from '../native/media';
import * as FileSystem from 'expo-file-system/legacy';
import { removeCasPath } from '../media/cas';
import { reconcileMediaState } from '../media/reconciliation';
import { createExecutorRunner } from './executorRunner';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { createExecutorSettingsCache } from './syncPolicy';
import { projectTerminalNotifications } from './terminalEvents';
import { repairStaleTaskStatuses } from './taskProjectionRepair';
import { createMonitorQueue } from './monitorQueue';

function createApplicationExecutor(database: AppDatabase) {
  const taskStore = createTaskRepository(database);
  const mediaStore = createSqliteMediaStore(database);
  const compatibilityJobs = createJobRepository(database);
  const jobs = createJobStateRepository(database);
  const operations = createOperationRepository(database);
  const blobs = createCasRepository(database);
  const cas = createArtifactCas();
  const commitArtifact = createSqliteArtifactCommitter(database, Date.now, archiveCreativeOutput);
  const exportStore = createSqliteExportStore(database);

  const executorSettingsCache = createExecutorSettingsCache((settings) => {
    const adapters = createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? settings.token : undefined });
    const runtime = createWorkflowRuntime({ adapters });
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
        if (operation.payload.kind === 'creative_version') {
          await executeCreativeExport(database, operation, owner, {
            now: Date.now,
            verify: async (path, hash) => await sha256File(`${FileSystem.documentDirectory}${path}`) === hash,
            lookup: lookupCreativeImage,
            publish: (path, key, mime, hash) => exportCreativeImage(`${FileSystem.documentDirectory}${path}`, key, mime, hash),
          });
          return;
        }
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
      if (operation.kind !== 'ARTIFACT_DOWNLOAD') {
        const binding = operation.jobId ? await readCreativeJobBinding(database, operation.jobId) : null;
        if (!binding) return current.durable.handle(operation, owner);
        let exact: Awaited<ReturnType<ReturnType<typeof creativeAccounts>['resolveExact']>>;
        try { exact = await creativeAccounts(database).resolveExact(binding.credential_generation_id, operation.kind === 'SUBMIT' ? 'dispatch' : 'query'); }
        catch {
          await operations.finish(operation.id, owner, 'BLOCKED', Date.now(), { code: 'CREATIVE_CREDENTIAL_UNAVAILABLE', message: '绑定的凭据不可用；未改用其他账号。' });
          return;
        }
        const adapters = createBuiltinProviderAdapters({ resolveCredential: kind => kind === 'autodl-token' && exact.provider === 'autodl' ? exact.token : undefined });
        for (const [id, adapter] of adapters) adapters.set(id, bindCreativeAdapter(database, adapter, binding, exact, operation, owner));
        const durable = createDurableExecutor({ jobs, operations, adapters, runtime: createWorkflowRuntime({ adapters }), credentials: { get: async () => ({ ok: true }) } });
        await durable.handle(operation, owner);
        const job = operation.jobId ? await jobs.get(operation.jobId) : null;
        if (job && ['UNKNOWN','FAILED','SUCCEEDED','PARTIAL_SUCCEEDED','CANCELLED'].includes(job.status)) {
          const reservation = await readCreativeJobBinding(database, job.id);
          if (reservation?.state === 'DISPATCHED') await createCreativeBudget(database).transition(binding.id, { key: `outcome:${binding.id}`, to: 'UNKNOWN_HELD', evidence: '服务商未返回可核验费用；保留本次消费占用。' });
        }
        return;
      }
      if (operation.payload.compatibilityOnly === true) {
        await operations.finish(operation.id, owner, 'FAILED', Date.now(), { code: 'ARTIFACT_CONVERSION_RETIRED', message: 'Original playback replaces conversion.', retryable: false });
        return;
      }
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
        verifyVideo: probeVideoStructure,
        async ensureProjection(jobId, artifact) {
          const job = (await jobs.get(jobId));
          const task = await taskStore.get(jobId);
          if (!job) throw new Error('JOB_NOT_FOUND');
          if (!task) throw new Error('TASK_NOT_FOUND');
          await materializeJobArtifacts(job, [artifact], mediaStore, task);
        },
        async updateDownloadState(state, errorCode) {
          if (!operation.jobId) throw new Error('JOB_ID_MISSING');
          if (operation.payload.compatibilityOnly === true) {
            // Conversion has its own durable operation state. It cannot hide a downloaded original.
            await database.runAsync('UPDATE tasks SET updated_at=MAX(updated_at,?) WHERE id=?', Date.now(), operation.jobId);
            return;
          }
          const artifact = operation.payload.artifact as ArtifactRecord | undefined;
          if (!artifact?.id) throw new Error('ARTIFACT_INPUT_INVALID');
          const timestamp = Date.now();
          const taskUpdated = await taskStore.updateMediaProjection(operation.jobId, {
            downloadState: state,
            downloadError: artifactNetworkMessage(errorCode) ?? errorCode,
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
          if (state === 'DOWNLOAD_FAILED' && errorCode?.startsWith('ARTIFACT_COMPATIBILITY_')) {
            await exportStore.refreshStatus(operation.jobId, `${operation.jobId}:${artifact.id}`, timestamp);
          }
        },
        async policy(jobId) {
          const job = (await jobs.get(jobId));
          const policy = job ? current.adapters.get(job.adapterId)?.manifest().artifactDownloadPolicy : undefined;
          return normalizeArtifactDownloadPolicy(policy);
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

  async function executorForCurrentSettings() {
    return executorSettingsCache.getOrCreate(await readSettings());
  }

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


  const executorRunner = createExecutorRunner({
    db: database, wakes: createExecutorWakeRepository(database),
    runCycle: async request => {
      await retireVideoConversion(database, { now: Date.now(), resolveUri: path => `${FileSystem.documentDirectory ?? ''}${path}`, fileExists: async uri => { const info = await FileSystem.getInfoAsync(uri); return info.exists && !info.isDirectory; } });
      const repair = await repairStaleTaskStatuses(database);
      const result = await cycle.run({ reason: request.trigger === 'background' ? 'background' : request.trigger === 'service' ? 'service' : 'foreground' });
      return { ...result, budgetExhausted: result.budgetExhausted || repair.hasMore };
    },
    pendingSummary: () => operations.pendingSummary({ now: Date.now() }),
    maintain: async () => {
      await repairTaskProjections(32);
      await reconcileMediaState({ db: database, fileExists: async uri => { const info = await FileSystem.getInfoAsync(uri); return info.exists && !info.isDirectory; }, removeCasPath });
    },
  });
  async function readTerminalNotifications(taskIds: string[]) { return projectTerminalNotifications((await jobs.listTerminalEvents(taskIds))); }

  return { executorRunner, readTerminalNotifications };
}

let shared: { database: AppDatabase; runtime: ReturnType<typeof createApplicationExecutor> } | undefined;
async function currentExecutor() {
  const database = getDatabase();
  await assertAppDatabaseWritableAsync(database);
  // Keep check, synchronous construction and assignment together: no await here.
  // If construction becomes async, cache its in-flight promise per database.
  if (!shared || shared.database !== database) shared = { database, runtime: createApplicationExecutor(database) };
  return shared.runtime;
}

export const executorRunner: ExecutorRunner = {
  async runSlice(request) { if (await readPendingMaintenance()) return { capturedGeneration: 0, handledGeneration: 0, remainingDue: 0, remainingScheduled: 0, budgetExhausted: false }; return (await currentExecutor()).executorRunner.runSlice(request); },
};
export async function readTerminalNotifications(taskIds: string[]) {
  return (await currentExecutor()).readTerminalNotifications(taskIds);
}

export async function getMonitorQueue() {
  const db = getDatabase();
  await assertAppDatabaseWritableAsync(db);
  if (await readPendingMaintenance()) throw new Error('DATABASE_MAINTENANCE_PENDING');
  return createMonitorQueue(db);
}
