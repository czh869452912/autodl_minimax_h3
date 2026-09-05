import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createTaskRepository } from '../../tasks/repository';
import { createSqliteMediaStore } from '../../media/repository';
import { createCasRepository } from '../../media/casRepository';
import { createOperationRepository } from './operationRepository';
import { createMediaCommandService } from './mediaCommandService';
import { createSqliteArtifactCommitter, handleArtifactDownload } from './artifactOperation';
import { createSqliteExportStore, handleExport } from './exportOperation';
import { createExecutorTick } from './tick';
import { createExecutorCycle } from './cycle';
import type { WorkflowOperation } from './types';

function seed(db: ReturnType<typeof createInitializedRealSqliteTestDb>) {
  db.runSync(
    "INSERT INTO tasks (id,prompt,status,resolution,duration,video_url,download_state,export_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    'job-1', 'result', 'SUCCESS', '768p竖', 5, 'https://cdn.example/video.mp4', 'ENQUEUED', 'NOT_REQUESTED', 1, 2,
  );
  db.runSync(
    "INSERT INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    'job-1', 'demo', '1', 'hash', 'demo', '1', '{}', 'SUCCEEDED', 1, 2, 1,
  );
  db.runSync(
    'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
    'video-1', 'job-1', 'video', 'https://cdn.example/video.mp4', 'video/mp4', '{}',
  );
  db.runSync(
    "INSERT INTO media_assets (id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,artifact_id,job_id,workflow_id,kind,export_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    'job-1:video-1', 'job-1', 'result', 'result', 'https://cdn.example/video.mp4', 'video/mp4', 'queued',
    1, 2, 'video-1', 'job-1', 'demo', 'video', 'NOT_REQUESTED',
  );
}

test('manual save joins a claimed download and publication recovery commits one durable delivery', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    seed(db);
    const operations = createOperationRepository(db as never);
    const tasks = createTaskRepository(db as never);
    const media = createSqliteMediaStore(db);
    const blobs = createCasRepository(db as never);
    const existing = new Set<string>();
    const commands = createMediaCommandService({
      db: db as never,
      fileExists: async (uri) => existing.has(uri),
      resolveCasUri: (path) => `file:///documents/${path}`,
      now: () => 100,
    });

    const initial = await commands.requestDownload('job-1');
    await expect(commands.requestDownload('job-1')).resolves.toMatchObject({
      status: 'in-flight', operation: { id: initial.operation?.id },
    });

    const exportStore = createSqliteExportStore(db as never);
    const createdPublications = new Map<string, string>();
    const publish = jest.fn(async (_sourceUri: string, options: { displayName: string }) => {
      const existingUri = createdPublications.get(options.displayName);
      if (existingUri) return { uri: existingUri };
      const uri = 'content://media/external/video/7';
      createdPublications.set(options.displayName, uri);
      return { uri };
    });
    let interruptOnce = true;
    const executor = {
      async recover(now: number) { operations.recoverExpired(now); },
      async handle(operation: WorkflowOperation, owner: string) {
        if (operation.kind === 'ARTIFACT_DOWNLOAD') {
          await handleArtifactDownload(operation, owner, {
            operations,
            blobs,
            cas: {
              adoptNativePart: async () => {
                const relativePath = `cas/sha256/aa/${'a'.repeat(64)}`;
                const blob = { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath };
                return {
                  ...blob,
                  stagedRelativePath: 'cas/parts/download.part',
                  publish: async () => { existing.add(`file:///documents/${relativePath}`); return blob; },
                  abort: async () => undefined,
                };
              },
              stage: async () => { throw new Error('legacy stream staging reached'); },
              put: async () => {
                const relativePath = `cas/sha256/aa/${'a'.repeat(64)}`;
                existing.add(`file:///documents/${relativePath}`);
                return { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath };
              },
            },
            transferArtifact: async () => {
              await commands.requestExport('job-1', { keepPrivateCopy: false });
              return {
                partUri: 'file:///documents/cas/parts/download.part', finalUrl: 'https://cdn.example/video.mp4',
                mime: 'video/mp4', byteSize: 3, sha256: 'a'.repeat(64),
              };
            },
            cancelArtifactTransfer: async () => false,
            policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }),
            ensureProjection: async () => undefined,
            updateDownloadState: async () => undefined,
            deliveryPolicy: { autoExportToGallery: false, keepPrivateCopy: true },
            verifyVideo: async () => undefined,
            updateProjection: async () => undefined,
            commit: createSqliteArtifactCommitter(db as never),
            resolveUri: (path) => `file:///documents/${path}`,
            now: () => 100,
          });
          return;
        }
        if (operation.kind === 'EXPORT') {
          await handleExport(operation, owner, {
            now: () => 100,
            assertSource: async () => undefined,
            markExporting: exportStore.markExporting,
            canPublish: exportStore.canPublish,
            publish,
            afterPublish: () => {
              if (interruptOnce) {
                interruptOnce = false;
                throw new Error('SIMULATED_PROCESS_EXIT');
              }
            },
            commitSuccess: exportStore.commitSuccess,
            retry: exportStore.retry,
            finishFailure: exportStore.finishFailure,
          });
        }
      },
    };
    const tick = createExecutorTick({ operations, executor, owner: () => 'worker', isReadonly: () => false });
    const cycle = createExecutorCycle({ runTick: (options) => tick.run(options), now: () => 100 });

    await cycle.run({ reason: 'foreground', maxPasses: 4, maxOperationsTotal: 8 });

    expect(operations.list('ARTIFACT_DOWNLOAD')).toHaveLength(1);
    expect(operations.list('EXPORT')).toMatchObject([{ state: 'SUCCEEDED', attempt: 2, payload: { keepPrivateCopy: false } }]);
    expect(blobs.hasReference('a'.repeat(64), 'workflow_artifact', 'job-1:video-1')).toBe(false);
    expect(db.getAllSync('SELECT * FROM artifact_blobs')).toHaveLength(1);
    expect(db.getAllSync('SELECT * FROM media_deliveries')).toMatchObject([
      { asset_id: 'job-1:video-1', status: 'EXPORTED', uri: 'content://media/external/video/7' },
    ]);
    await expect(tasks.get('job-1')).resolves.toMatchObject({
      downloadState: 'DOWNLOADED', exportState: 'EXPORTED', localUri: undefined,
    });
    await expect(media.get('job-1:video-1')).resolves.toMatchObject({
      exportStatus: 'EXPORTED', localPath: undefined,
    });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(createdPublications.size).toBe(1);
  } finally {
    db.close();
  }
});

test('task removal remains fenced while a manual media command is claimed', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    seed(db);
    const commands = createMediaCommandService({
      db: db as never,
      fileExists: async () => false,
      resolveCasUri: (path) => `file:///documents/${path}`,
      now: () => 100,
    });
    const queued = await commands.requestDownload('job-1');
    createOperationRepository(db as never).claimById(queued.operation?.id ?? '', 'worker', 100, 1_000);
    await expect(createTaskRepository(db as never).remove('job-1')).rejects.toThrow('TASK_OPERATION_IN_PROGRESS');
  } finally {
    db.close();
  }
});
