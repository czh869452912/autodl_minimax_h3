import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import type { ArtifactCas } from '../../media/cas';
import { artifactExportDisplayName, createSqliteArtifactCommitter, handleArtifactDownload } from './artifactOperation';
import type { WorkflowOperation } from './types';
import { createOperationRepository } from './operationRepository';
import { createTaskRepository } from '../../tasks/repository';
import { createSqliteMediaStore } from '../../media/repository';

const operation: WorkflowOperation = {
  id: 'download-1', kind: 'ARTIFACT_DOWNLOAD', jobId: 'job-1', idempotencyKey: 'artifact:job-1:video-1',
  payload: { artifact: { id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn.example/video.mp4', mime: 'video/mp4' } },
  state: 'CLAIMED', attempt: 1, nextRetryAt: 1, leaseOwner: 'worker', leaseExpiresAt: 100,
  createdAt: 1, updatedAt: 1,
};

function setup() {
  const stream = { async *[Symbol.asyncIterator]() { yield new Uint8Array([1, 2, 3]); } };
  const operations = { finish: jest.fn(() => true), retry: jest.fn(() => true), renew: jest.fn(() => true) };
  const blobs = { upsertBlob: jest.fn(), retain: jest.fn() };
  const cas = { put: jest.fn(async (..._args: Parameters<ArtifactCas['put']>) => ({ sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: `cas/sha256/aa/${'a'.repeat(64)}` })) };
  const openDownload = jest.fn(async () => ({ finalUrl: 'https://cdn.example/video.mp4', status: 200, mime: 'video/mp4', stream }));
  const updateProjection = jest.fn(async () => undefined);
  const ensureProjection = jest.fn(async () => undefined);
  const updateDownloadState = jest.fn(async () => undefined);
  const deliveryPolicy = { autoExportToGallery: true, keepPrivateCopy: true };
  return { operations, blobs, cas, openDownload, updateProjection, ensureProjection, updateDownloadState, deliveryPolicy };
}

test('ensures the media row and marks downloading before opening the network stream', async () => {
  const order: string[] = [];
  await handleArtifactDownload(operation, 'worker', {
    ...setup(),
    ensureProjection: jest.fn(async () => { order.push('projection'); }),
    updateDownloadState: jest.fn(async (state) => { order.push(state); }),
    openDownload: jest.fn(async () => { order.push('network'); throw new Error('域名不在允许列表'); }),
    policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }),
  });
  expect(order.slice(0, 3)).toEqual(['projection', 'DOWNLOADING', 'network']);
});

test('writes a terminal failed projection when validation fails', async () => {
  const deps = setup();
  deps.openDownload.mockRejectedValueOnce(Object.assign(new Error('opaque integrity failure'), {
    code: 'ARTIFACT_INTEGRITY_FAILED', retryable: false,
  }));
  await handleArtifactDownload(operation, 'worker', {
    ...deps,
    now: () => 50,
    policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }),
  });
  expect(deps.updateDownloadState).toHaveBeenLastCalledWith('DOWNLOAD_FAILED', 'ARTIFACT_INTEGRITY_FAILED');
});

test('streams into CAS, retains the blob, updates projection, and finishes', async () => {
  const deps = setup();
  await handleArtifactDownload(operation, 'worker', {
    ...deps, now: () => 50, policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10, acceptedMimes: ['video/mp4'] }),
  });
  expect(deps.openDownload).toHaveBeenCalledWith('https://cdn.example/video.mp4', expect.objectContaining({ allowedHosts: ['cdn.example'] }));
  expect(deps.cas.put).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mime: 'video/mp4', maxBytes: 10, operationId: 'download-1' }));
  const putOptions = deps.cas.put.mock.calls[0][1];
  expect(putOptions.operationAttempt).toBe(1);
  expect(putOptions.assertLease).toEqual(expect.any(Function));
  if (!putOptions.assertLease) throw new Error('lease fence missing');
  expect(putOptions.assertLease()).toBeUndefined();
  expect(deps.operations.renew).toHaveBeenCalledWith('download-1', 'worker', 50, 120_000);
  expect(deps.blobs.upsertBlob).toHaveBeenCalledWith(expect.objectContaining({ sha256: 'a'.repeat(64), createdAt: 50, verifiedAt: 50 }));
  expect(deps.blobs.retain).toHaveBeenCalledWith('a'.repeat(64), 'workflow_artifact', 'job-1:video-1', 50);
  expect(deps.updateProjection).toHaveBeenCalledWith(expect.objectContaining({ localUri: expect.stringContaining('cas/sha256') }));
  expect(deps.operations.finish).toHaveBeenCalledWith('download-1', 'worker', 'SUCCEEDED', 50);
});

test('retries connection and idle timeouts with bounded backoff', async () => {
  const deps = setup();
  deps.openDownload.mockRejectedValueOnce(Object.assign(new Error('opaque transfer failure'), {
    code: 'ARTIFACT_CONNECT_TIMEOUT', retryable: true,
  }));
  await handleArtifactDownload(operation, 'worker', { ...deps, now: () => 50, policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }) });
  expect(deps.operations.retry).toHaveBeenCalledWith('download-1', 'worker', expect.objectContaining({
    now: 50, nextRetryAt: 1050, error: expect.objectContaining({ code: 'ARTIFACT_CONNECT_TIMEOUT' }),
  }));
  expect(deps.updateDownloadState).toHaveBeenLastCalledWith('ENQUEUED', 'ARTIFACT_CONNECT_TIMEOUT');
  expect(deps.operations.finish).not.toHaveBeenCalled();
});

test('treats structured policy and integrity failures as terminal', async () => {
  for (const code of ['ARTIFACT_HOST_DENIED', 'ARTIFACT_MIME_REJECTED', 'ARTIFACT_SIZE_REJECTED', 'ARTIFACT_INTEGRITY_FAILED']) {
    const deps = setup();
    deps.openDownload.mockRejectedValueOnce(Object.assign(new Error('opaque terminal failure'), { code, retryable: false }));
    await handleArtifactDownload(operation, 'worker', { ...deps, now: () => 50, policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }) });
    expect(deps.operations.finish).toHaveBeenCalledWith('download-1', 'worker', 'FAILED', 50, expect.objectContaining({ code, retryable: false }));
    expect(deps.operations.retry).not.toHaveBeenCalled();
  }
});

test('rolls back blob and reference metadata when the operation lease is lost', () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    db.runSync("INSERT INTO tasks (id,prompt,status,resolution,duration,created_at,updated_at) VALUES ('job-1','result','SUCCESS','768p竖',5,1,2)");
    db.runSync("INSERT INTO media_assets (id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,artifact_id,job_id,kind) VALUES ('job-1:video-1','job-1','result','result','https://cdn.example/video.mp4','video/mp4','downloading',1,2,'video-1','job-1','video')");
    const commit = createSqliteArtifactCommitter(db as never);
    expect(() => commit({
      operationId: 'missing-operation', owner: 'worker', jobId: 'job-1',
      artifact: { id: 'video-1', jobId: 'job-1', kind: 'video' },
      blob: { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 50, verifiedAt: 50 },
      localUri: 'file:///cas/sha256/aa/blob', now: 50,
      deliveryPolicy: { autoExportToGallery: true, keepPrivateCopy: false },
    })).toThrow('lease lost');
    expect(db.getFirstSync('SELECT sha256 FROM artifact_blobs LIMIT 1')).toBeUndefined();
    expect(db.getFirstSync('SELECT blob_sha256 FROM artifact_blob_refs LIMIT 1')).toBeUndefined();
  } finally { db.close(); }
});

async function seedArtifactCommit(db: ReturnType<typeof createInitializedRealSqliteTestDb>) {
  const taskStore = createTaskRepository(db as never);
  const mediaStore = createSqliteMediaStore(db);
  const operationStore = createOperationRepository(db as never);
  await taskStore.upsert({
    id: 'job-1', prompt: 'result', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    videoUrl: 'https://cdn.example/video.mp4', createdAt: 1, updatedAt: 2,
  });
  await mediaStore.upsert({
    id: 'job-1:video-1', taskId: 'job-1', artifactId: 'video-1', jobId: 'job-1',
    title: 'result', prompt: 'result', sourceUrl: 'https://cdn.example/video.mp4', mimeType: 'video/mp4',
    kind: 'video', status: 'downloading', createdAt: 1, updatedAt: 2,
  });
  operationStore.enqueue({
    id: 'download-1', kind: 'ARTIFACT_DOWNLOAD', jobId: 'job-1', idempotencyKey: 'artifact:job-1:video-1',
    payload: operation.payload, now: 1,
  });
  operationStore.claimById('download-1', 'worker', 1, 100);
  return { taskStore, mediaStore, operationStore };
}

test('commits the download and enqueues enabled gallery export atomically', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const { taskStore, mediaStore, operationStore } = await seedArtifactCommit(db);
    createSqliteArtifactCommitter(db as never)({
      operationId: 'download-1', owner: 'worker', jobId: 'job-1',
      artifact: operation.payload.artifact as never,
      blob: { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 50, verifiedAt: 50 },
      localUri: 'file:///cas/video', now: 50,
      deliveryPolicy: { autoExportToGallery: true, keepPrivateCopy: false },
    });

    expect(operationStore.list('EXPORT')).toMatchObject([{
      idempotencyKey: 'export:job-1:video-1:system-gallery',
      payload: {
        assetId: 'job-1:video-1', artifactId: 'video-1', sourceUri: 'file:///cas/video',
        blobSha256: 'a'.repeat(64), keepPrivateCopy: false,
        displayName: artifactExportDisplayName('job-1', 'video-1'),
      },
    }]);
    await expect(taskStore.get('job-1')).resolves.toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'QUEUED' });
    await expect(mediaStore.get('job-1:video-1')).resolves.toMatchObject({ status: 'downloaded', exportStatus: 'QUEUED' });
  } finally { db.close(); }
});

test('uses distinct native-safe display names for artifact ids that sanitize alike', () => {
  const first = artifactExportDisplayName('job-1', 'artifact:0');
  const second = artifactExportDisplayName('job-1', 'artifact/0');
  expect(first).not.toBe(second);
  expect(first).toMatch(/^[A-Za-z0-9._-]+\.mp4$/);
  expect(second).toMatch(/^[A-Za-z0-9._-]+\.mp4$/);
});

test('rejects a blob commit while another executor owns the CAS GC lease', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const { operationStore } = await seedArtifactCommit(db);
    db.runSync("INSERT INTO app_scheduler_leases (lease_key,owner,expires_at) VALUES ('cas-gc','collector',200)");
    expect(() => createSqliteArtifactCommitter(db as never, () => 100)({
      operationId: 'download-1', owner: 'worker', jobId: 'job-1',
      artifact: operation.payload.artifact as never,
      blob: { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 50, verifiedAt: 50 },
      localUri: 'file:///cas/video', now: 50,
      deliveryPolicy: { autoExportToGallery: true, keepPrivateCopy: false },
    })).toThrow('CAS_GC_IN_PROGRESS');
    expect(operationStore.get('download-1')).toMatchObject({ state: 'CLAIMED' });
  } finally { db.close(); }
});

test('commits a private download without export when auto export is disabled', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const { taskStore, mediaStore, operationStore } = await seedArtifactCommit(db);
    createSqliteArtifactCommitter(db as never)({
      operationId: 'download-1', owner: 'worker', jobId: 'job-1',
      artifact: operation.payload.artifact as never,
      blob: { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 50, verifiedAt: 50 },
      localUri: 'file:///cas/video', now: 50,
      deliveryPolicy: { autoExportToGallery: false, keepPrivateCopy: true },
    });

    expect(operationStore.list('EXPORT')).toEqual([]);
    await expect(taskStore.get('job-1')).resolves.toMatchObject({ downloadState: 'DOWNLOADED', exportState: 'NOT_REQUESTED' });
    await expect(mediaStore.get('job-1:video-1')).resolves.toMatchObject({ status: 'downloaded', exportStatus: 'NOT_REQUESTED' });
  } finally { db.close(); }
});
