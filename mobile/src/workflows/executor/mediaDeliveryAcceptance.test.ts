import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createJobStateRepository } from './jobStateRepository';
import { createOperationRepository } from './operationRepository';
import { createDurableExecutor } from './durableExecutor';
import { createExecutorTick } from './tick';
import { createExecutorCycle } from './cycle';
import { createTaskRepository } from '../../tasks/repository';
import { createSqliteMediaStore } from '../../media/repository';
import { createCasRepository } from '../../media/casRepository';
import { materializeJobArtifacts } from '../../media/materializer';
import { createSqliteArtifactCommitter, handleArtifactDownload } from './artifactOperation';
import { createSqliteExportStore, handleExport } from './exportOperation';
import type { ArtifactRecord } from '../../jobs/types';
import type { WorkflowOperation } from './types';

test('drives terminal status through download and system-gallery export exactly once', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const jobs = createJobStateRepository(db as never);
    const operations = createOperationRepository(db as never);
    const tasks = createTaskRepository(db as never);
    const media = createSqliteMediaStore(db);
    const blobs = createCasRepository(db as never);
    const publish = jest.fn(async () => ({ uri: 'content://media/external/video/7' }));
    const adapter = {
      manifest: () => ({ id: 'demo', adapterVersion: '1.0.0' }),
      validateCredentials: jest.fn(async () => ({ ok: true })),
      submit: jest.fn(async () => ({ providerJobId: 'remote-1' })),
      getStatus: jest.fn(async () => ({
        status: 'SUCCEEDED' as const, rawStatus: 'done',
        artifacts: [{ id: 'video-1', jobId: '', kind: 'video' as const, uri: 'https://cdn.test/video.mp4', mime: 'video/mp4' }],
      })),
    };
    const runtime = {
      prepareSubmission: () => ({
        workflowId: 'demo', workflowVersion: '1', workflowContentHash: 'hash', adapterId: 'demo', adapterVersion: '1',
        inputSnapshot: { prompt: 'hello' }, requestInput: { prompt: 'hello' }, target: { operation: 'workflow.submit' },
      }),
      mapStatus: (job: NonNullable<ReturnType<typeof jobs.get>>, update: Awaited<ReturnType<typeof adapter.getStatus>>) => ({
        job: { ...job, status: update.status, updatedAt: 100 },
        artifacts: update.artifacts.map((artifact) => ({ ...artifact, jobId: job.id })),
      }),
    };
    const durable = createDurableExecutor({
      jobs, operations, runtime, adapters: new Map([['demo', adapter]]) as never,
      credentials: { get: async () => ({ ok: true }) }, now: () => 100,
    });
    const job = await durable.queueSubmission({
      submissionId: 'delivery', workflow: { id: 'demo', version: '1' } as never,
      draft: {} as never, provenance: { workflowId: 'demo', workflowVersion: '1', contentHash: 'hash' },
    });
    await tasks.upsert({
      id: job.id, prompt: 'hello', status: 'SUCCESS', resolution: '768p竖', duration: 5,
      workflowId: 'demo', videoUrl: 'https://cdn.test/video.mp4', createdAt: 1, updatedAt: 2,
    });

    const exportStore = createSqliteExportStore(db as never);
    const executor = {
      recover: durable.recover,
      async handle(operation: WorkflowOperation, owner: string) {
        if (operation.kind === 'ARTIFACT_DOWNLOAD') {
          await handleArtifactDownload(operation, owner, {
            operations,
            blobs,
            cas: {
              adoptNativePart: async () => {
                const blob = { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: `cas/sha256/aa/${'a'.repeat(64)}` };
                return {
                  ...blob,
                  stagedRelativePath: 'cas/parts/download.part',
                  publish: async () => blob,
                  abort: async () => undefined,
                };
              },
            },
            transferArtifact: async () => ({
              partUri: 'file:///cas/parts/download.part', finalUrl: 'https://cdn.test/video.mp4',
              mime: 'video/mp4', byteSize: 3, sha256: 'a'.repeat(64),
            }),
            cancelArtifactTransfer: async () => false,
            policy: () => ({ allowedHosts: ['cdn.test'], maxBytes: 10 }),
            deliveryPolicy: { autoExportToGallery: true, keepPrivateCopy: true },
            verifyVideo: async () => undefined,
            ensureProjection: async (jobId, artifact) => {
              const current = jobs.get(jobId);
              const task = await tasks.get(jobId);
              if (!current || !task) throw new Error('projection source missing');
              await materializeJobArtifacts(current, [artifact], media, task);
            },
            updateDownloadState: async (state) => {
              const artifact = operation.payload.artifact as ArtifactRecord;
              await tasks.updateMediaProjection(job.id, { downloadState: state, updatedAt: 100 });
              const asset = await media.get(`${job.id}:${artifact.id}`);
              if (asset) await media.upsertArtifactProjection?.({ ...asset, status: state === 'DOWNLOADING' ? 'downloading' : state === 'ENQUEUED' ? 'queued' : 'failed' });
            },
            updateProjection: async () => undefined,
            commit: createSqliteArtifactCommitter(db as never),
            resolveUri: (path) => `file:///${path}`,
            now: () => 100,
          });
          return;
        }
        if (operation.kind === 'EXPORT') {
          await handleExport(operation, owner, {
            now: () => 100,
            assertSource: async () => undefined,
            publish,
            markExporting: exportStore.markExporting,
            commitSuccess: exportStore.commitSuccess,
            retry: exportStore.retry,
            finishFailure: exportStore.finishFailure,
          });
          return;
        }
        await durable.handle(operation, owner);
      },
    };
    const tick = createExecutorTick({ operations, executor, owner: () => 'worker', isReadonly: () => false });
    const cycle = createExecutorCycle({ runTick: (options) => tick.run(options), now: () => 100 });

    await expect(cycle.run({ reason: 'foreground', maxPasses: 4, maxOperationsTotal: 8 })).resolves.toMatchObject({
      passes: 4, remainingDue: 0, budgetExhausted: false,
    });
    expect(jobs.get(job.id)).toMatchObject({ status: 'SUCCEEDED' });
    expect(db.getAllSync('SELECT id FROM workflow_artifacts WHERE job_id=?', job.id)).toHaveLength(1);
    await expect(media.get(`${job.id}:video-1`)).resolves.toMatchObject({ status: 'downloaded', exportStatus: 'EXPORTED' });
    await expect(tasks.get(job.id)).resolves.toMatchObject({
      videoUrl: 'https://cdn.test/video.mp4', downloadState: 'DOWNLOADED', exportState: 'EXPORTED',
      galleryUri: 'content://media/external/video/7',
    });
    expect(db.getAllSync('SELECT * FROM media_deliveries')).toHaveLength(1);
    expect(publish).toHaveBeenCalledTimes(1);

    await cycle.run({ reason: 'foreground', maxPasses: 4, maxOperationsTotal: 8 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(db.getAllSync('SELECT * FROM media_deliveries')).toHaveLength(1);
  } finally { db.close(); }
});
