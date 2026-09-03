import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import type { ArtifactCas } from '../../media/cas';
import { createSqliteArtifactCommitter, handleArtifactDownload } from './artifactOperation';
import type { WorkflowOperation } from './types';

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
  return { operations, blobs, cas, openDownload, updateProjection, ensureProjection, updateDownloadState };
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
  deps.openDownload.mockRejectedValueOnce(new Error('CAS hash mismatch'));
  await handleArtifactDownload(operation, 'worker', {
    ...deps,
    now: () => 50,
    policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }),
  });
  expect(deps.updateDownloadState).toHaveBeenLastCalledWith('DOWNLOAD_FAILED', 'ARTIFACT_VALIDATION_FAILED');
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
  deps.openDownload.mockRejectedValueOnce(new Error('下载连接超时'));
  await handleArtifactDownload(operation, 'worker', { ...deps, now: () => 50, policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }) });
  expect(deps.operations.retry).toHaveBeenCalledWith('download-1', 'worker', expect.objectContaining({ now: 50, nextRetryAt: 1050 }));
  expect(deps.updateDownloadState).toHaveBeenLastCalledWith('ENQUEUED');
  expect(deps.operations.finish).not.toHaveBeenCalled();
});

test('treats URL policy, MIME, size, and hash failures as terminal', async () => {
  for (const message of ['域名不在允许列表', '下载媒体类型不受支持', 'CAS 文件大小超过限制', 'CAS hash mismatch']) {
    const deps = setup();
    deps.openDownload.mockRejectedValueOnce(new Error(message));
    await handleArtifactDownload(operation, 'worker', { ...deps, now: () => 50, policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10 }) });
    expect(deps.operations.finish).toHaveBeenCalledWith('download-1', 'worker', 'FAILED', 50, expect.objectContaining({ retryable: false }));
    expect(deps.operations.retry).not.toHaveBeenCalled();
  }
});

test('rolls back blob and reference metadata when the operation lease is lost', () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const commit = createSqliteArtifactCommitter(db as never);
    expect(() => commit({
      operationId: 'missing-operation', owner: 'worker', jobId: 'job-1',
      artifact: { id: 'video-1', jobId: 'job-1', kind: 'video' },
      blob: { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 50, verifiedAt: 50 },
      localUri: 'file:///cas/sha256/aa/blob', now: 50,
    })).toThrow('lease lost');
    expect(db.getFirstSync('SELECT sha256 FROM artifact_blobs LIMIT 1')).toBeUndefined();
    expect(db.getFirstSync('SELECT blob_sha256 FROM artifact_blob_refs LIMIT 1')).toBeUndefined();
  } finally { db.close(); }
});
