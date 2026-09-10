import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createSqliteArtifactCommitter, handleArtifactDownload } from './artifactOperation';
import { createOperationRepository } from './operationRepository';
import { createTaskProjectionRepository } from '../../tasks/projectionRepository';
import { createMediaCommandService } from './mediaCommandService';
import type { WorkflowOperation } from './types';
import { createSqliteExportStore } from './exportOperation';

test('original becomes available before conversion; legacy conversion remains readable but is not requeued', async () => {
  const db = createInitializedRealSqliteTestDb();
  const hash = 'a'.repeat(64);
  const blob = { sha256: hash, mime: 'video/mp4', byteSize: 100, relativePath: `cas/sha256/aa/${hash}`, createdAt: 1, verifiedAt: 1 };
  const uri = `file:///documents/${blob.relativePath}`;
  const artifact = { id: 'v', jobId: 'j', kind: 'video' as const, uri: 'https://expired.example/video.mp4', mime: 'video/mp4' };
  try {
    db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('j','p','SUCCESS','768p',10,1,1)");
    db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,job_id,artifact_id,kind) VALUES('j:v','j','p','p',?,'video/mp4','queued',1,1,'j','v','video')", artifact.uri);
    db.runSync("INSERT INTO workflow_artifacts(id,job_id,kind,uri,mime) VALUES('v','j','video',?,'video/mp4')", artifact.uri);
    db.runSync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at,lease_owner,lease_expires_at) VALUES('d','ARTIFACT_DOWNLOAD','j','d',?,'CLAIMED',1,1,1,1,'worker',1000)", JSON.stringify({ artifact }));
    const operations = createOperationRepository(db as never);
    const commit = createSqliteArtifactCommitter(db as never, () => 10);
    // The CAS bytes are represented by the transfer mock; original lookup still checks durable references.
    commit.original = async () => db.getFirstSync("SELECT 1 FROM artifact_blob_refs WHERE owner_type='workflow_artifact_original' AND owner_id='j:v'") ? blob : undefined;
    const transfer = jest.fn(async () => ({ partUri: 'file:///part', finalUrl: artifact.uri, mime: blob.mime, byteSize: blob.byteSize, sha256: hash }));
    const convert = jest.fn(async () => { throw { code: 'MEDIA_COMPATIBILITY_ENCODE_FAILED', userInfo: { stage: 'encode' } }; });
    const handle = async (operation: WorkflowOperation) => handleArtifactDownload(operation, 'worker', {
      operations, commit, now: () => 10,
      blobs: { upsertBlob: jest.fn(), retain: jest.fn() },
      cas: { adoptNativePart: async () => ({ ...blob, stagedRelativePath: 'part', publish: async () => blob, abort: async () => undefined }) },
      transferArtifact: transfer, prepareCompatibleVideo: convert,
      verifyVideo: async () => { throw { code: 'MEDIA_CODEC_UNSUPPORTED' }; },
      policy: () => ({ allowedHosts: ['expired.example'], maxBytes: 1024 }),
      deliveryPolicy: { autoExportToGallery: false, keepPrivateCopy: true },
      ensureProjection: async () => undefined, updateProjection: jest.fn(), resolveUri: path => `file:///documents/${path}`,
      updateDownloadState: async state => {
        if (!operation.payload.compatibilityOnly) db.runSync('UPDATE tasks SET download_state=? WHERE id=?', state, 'j');
      },
    });
    await handle((await operations.get('d'))!);
    expect((await operations.get('d'))!.state).toBe('SUCCEEDED');
    expect(convert).not.toHaveBeenCalled();
    expect(db.getFirstSync('SELECT local_uri,download_state FROM tasks')).toEqual({ local_uri: uri, download_state: 'DOWNLOADED' });
    const childId = 'd:compatibility-v2';
    expect((await operations.get(childId))!.payload.compatibilityOnly).toBe(true);
    db.runSync("UPDATE workflow_operations SET state='CLAIMED',lease_owner='worker',lease_expires_at=1000 WHERE id=?", childId);
    await handle((await operations.get(childId))!);
    expect((await operations.get(childId))!.lastError).toMatchObject({ diagnosticCode: 'MEDIA_COMPATIBILITY_ENCODE_FAILED', diagnosticStage: 'encode' });
    expect((await createTaskProjectionRepository(db as never).readWindow()).items[0]).toMatchObject({ localUri: uri, downloadState: 'DOWNLOADED', compatibilityState: 'FAILED' });
    const commands = createMediaCommandService({ db: db as never, fileExists: async candidate => candidate === uri, resolveCasUri: path => `file:///documents/${path}`, now: () => 20 });
    expect((await commands.requestDownload('j')).status).toBe('already-complete');
    expect((await operations.get(childId))!.state).toBe('FAILED');
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(2);
    expect(db.getFirstSync('SELECT download_state FROM tasks')).toEqual({ download_state: 'DOWNLOADED' });
    const exported = await commands.requestExport('j', { keepPrivateCopy: true });
    expect(exported.operation?.payload).toMatchObject({ variant: 'original', sourceUri: uri });
    db.runSync("UPDATE media_deliveries SET status='EXPORTED' WHERE id='j:v:system-gallery:original'");
    await createSqliteExportStore(db as never).refreshStatus('j', 'j:v', 30);
    expect(db.getFirstSync('SELECT download_state,export_state FROM tasks')).toEqual({ download_state: 'DOWNLOADED', export_state: 'EXPORTED' });
  } finally { db.close(); }
});

test('a conversion-only operation never downloads a replacement when its original is missing', async () => {
  const transfer = jest.fn();
  const finish = jest.fn();
  const operation = { idempotencyKey: 'c', state: 'CLAIMED', nextRetryAt: 1, createdAt: 1, updatedAt: 1, id: 'c', jobId: 'j', kind: 'ARTIFACT_DOWNLOAD', attempt: 1,
    payload: { compatibilityOnly: true, artifact: { id: 'v', kind: 'video', uri: 'https://expired.example/v.mp4' } } } as WorkflowOperation;
  await handleArtifactDownload(operation, 'worker', {
    operations: { get: async () => operation, renew: async () => true, finish, retry: jest.fn() },
    blobs: { upsertBlob: jest.fn(), retain: jest.fn() }, cas: { adoptNativePart: jest.fn() },
    transferArtifact: transfer, prepareCompatibleVideo: jest.fn(), verifyVideo: jest.fn(),
    policy: () => ({ allowedHosts: ['expired.example'], maxBytes: 1024 }), ensureProjection: jest.fn(),
    updateProjection: jest.fn(), updateDownloadState: jest.fn(), deliveryPolicy: { autoExportToGallery: false, keepPrivateCopy: true },
  });
  expect(transfer).not.toHaveBeenCalled();
  expect(finish).toHaveBeenCalledWith('c', 'worker', 'FAILED', expect.any(Number), expect.objectContaining({ code: 'ARTIFACT_COMPATIBILITY_SOURCE_MISSING' }));
});
