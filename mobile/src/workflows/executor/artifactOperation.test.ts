import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
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
  const operations = { finish: jest.fn(() => true), retry: jest.fn(() => true) };
  const blobs = { upsertBlob: jest.fn(), retain: jest.fn() };
  const cas = { put: jest.fn(async () => ({ sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: `cas/sha256/aa/${'a'.repeat(64)}` })) };
  const openDownload = jest.fn(async () => ({ finalUrl: 'https://cdn.example/video.mp4', status: 200, mime: 'video/mp4', stream }));
  const updateProjection = jest.fn(async () => undefined);
  return { operations, blobs, cas, openDownload, updateProjection };
}

test('streams into CAS, retains the blob, updates projection, and finishes', async () => {
  const deps = setup();
  await handleArtifactDownload(operation, 'worker', {
    ...deps, now: () => 50, policy: () => ({ allowedHosts: ['cdn.example'], maxBytes: 10, acceptedMimes: ['video/mp4'] }),
  });
  expect(deps.openDownload).toHaveBeenCalledWith('https://cdn.example/video.mp4', expect.objectContaining({ allowedHosts: ['cdn.example'] }));
  expect(deps.cas.put).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mime: 'video/mp4', maxBytes: 10, operationId: 'download-1' }));
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
