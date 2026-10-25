import {creativeAccounts,defaultAutodlCredential} from '../creative/accountRuntime';
import {novelAiResponseStore} from '../creative/novelAiResponseStore';
import {createApplicationProviderRegistry} from '../providers/applicationRegistry';
import {createProviderExecution} from './providerExecution';
import {recoverUnsentCreativeJobs} from '../creative/unsentRecovery';
import { readPendingMaintenance } from '../storage/pendingMaintenance';
import { archiveCreativeOutput } from '../creative/archiveOutput';
import { migrateCreativeHistory } from '../creative/runtime';
import { resumeCreativePlans } from '../creative/planRuntime';
import { reconcileCreativePlans } from '../creative/planRunner';
import { recoverNovelAiResponses } from '../creative/novelAiRecovery';
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
import { createJobStateRepository } from './jobStateStore';
import { createOperationRepository } from '../workflows/executor/operationRepository';
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

  const providers=createApplicationProviderRegistry(database);
  const providerExecution=createProviderExecution({db:database,jobs,operations,providers,
    resolveExact:(id,use)=>creativeAccounts(database).resolveExact(id,use),resolveLegacyDefault:()=>defaultAutodlCredential(database)});

  const executor = {
    async recover(now: number) {
      await providerExecution.recover(now);
      await recoverUnsentCreativeJobs(database,now);
      await recoverNovelAiResponses(database, jobs, novelAiResponseStore(database), now);
    },
    async handle(operation: WorkflowOperation, owner: string) {
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
      if (operation.kind === 'SUBMIT' || operation.kind === 'STATUS_SYNC') {
        await providerExecution.handle(operation,owner);
        return;
      }
      const localArtifact = operation.payload.artifact as ArtifactRecord | undefined;
      if (localArtifact?.uri?.startsWith('asset://') && operation.jobId) {
        const job = await jobs.get(operation.jobId), task = await taskStore.get(operation.jobId);
        if (job?.adapterId !== 'novelai-image' || !task) throw new Error('LOCAL_ARTIFACT_SCOPE_INVALID');
        const hash = localArtifact.uri.slice(8);
        const blob = await database.getFirstAsync<{ sha256: string; byte_size: number; mime: string; relative_path: string; created_at: number; verified_at: number }>('SELECT * FROM artifact_blobs WHERE sha256=?', hash);
        if (!blob || await sha256File(`${FileSystem.documentDirectory}${blob.relative_path}`) !== hash) throw new Error('LOCAL_ARTIFACT_MISSING');
        if (!await operations.renew(operation.id, owner, Date.now(), 120_000)) throw new Error('LOCAL_ARTIFACT_LEASE_LOST');
        await materializeJobArtifacts(job, [localArtifact], mediaStore, task);
        await commitArtifact({ operationId: operation.id, owner, jobId: operation.jobId, artifact: localArtifact,
          blob: { sha256: hash, byteSize: blob.byte_size, mime: blob.mime, relativePath: blob.relative_path, createdAt: blob.created_at, verifiedAt: blob.verified_at },
          localUri: `${FileSystem.documentDirectory}${blob.relative_path}`, now: Date.now(), deliveryPolicy: { autoExportToGallery: false, autoExportImagesToGallery:(await readSettings()).autoExportImagesToGallery, keepPrivateCopy: true } });
        return;
      }
      if (operation.payload.compatibilityOnly === true) {
        await operations.finish(operation.id, owner, 'FAILED', Date.now(), { code: 'ARTIFACT_CONVERSION_RETIRED', message: 'Original playback replaces conversion.', retryable: false });
        return;
      }
      const settings=await readSettings();
      await handleArtifactDownload(operation, owner, {
        operations,
        blobs,
        cas,
        commit: commitArtifact,
        deliveryPolicy: {
          autoExportToGallery: settings.autoExportToGallery,
          autoExportImagesToGallery: settings.autoExportImagesToGallery,
          keepPrivateCopy: settings.keepPrivateCopy,
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
          const policy = job ? providers.artifactDownloadPolicy(job.adapterId) : undefined;
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
      await resumeCreativePlans(database);
      await retireVideoConversion(database, { now: Date.now(), resolveUri: path => `${FileSystem.documentDirectory ?? ''}${path}`, fileExists: async uri => { const info = await FileSystem.getInfoAsync(uri); return info.exists && !info.isDirectory; } });
      const repair = await repairStaleTaskStatuses(database);
      const result = await cycle.run({ reason: request.trigger === 'background' ? 'background' : request.trigger === 'service' ? 'service' : 'foreground' });
      await reconcileCreativePlans(database);
      return { ...result, budgetExhausted: result.budgetExhausted || repair.hasMore };
    },
    pendingSummary: () => operations.pendingSummary({ now: Date.now() }),
    maintain: async () => {
      await migrateCreativeHistory(database);
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
