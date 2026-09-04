import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createOperationRepository } from './operationRepository';
import { createTaskRepository } from '../../tasks/repository';
import { createSqliteMediaStore } from '../../media/repository';
import { createCasRepository } from '../../media/casRepository';
import { createSqliteExportStore, handleExport, type ExportPayload } from './exportOperation';
import type { WorkflowOperation } from './types';

const operation: WorkflowOperation = {
  id: 'export-1', kind: 'EXPORT', jobId: 'job-1',
  idempotencyKey: 'export:job-1:video-1:system-gallery',
  payload: {
    assetId: 'job-1:video-1', artifactId: 'video-1', sourceUri: 'file:///cas/video',
    sourceKind: 'cas', blobSha256: 'a'.repeat(64), keepPrivateCopy: true, displayName: 'job-1.mp4',
  },
  state: 'CLAIMED', attempt: 1, nextRetryAt: 1,
  leaseOwner: 'worker', leaseExpiresAt: 100, createdAt: 1, updatedAt: 1,
};

function setupExport() {
  return {
    now: () => 50,
    assertSource: jest.fn(async () => undefined),
    markExporting: jest.fn(async () => undefined),
    canPublish: jest.fn(() => true),
    publish: jest.fn(async () => ({ uri: 'content://media/external/video/7' })),
    commitSuccess: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    finishFailure: jest.fn(async () => undefined),
  };
}

test('publishes with a stable name and commits all delivery projections', async () => {
  const deps = setupExport();
  await handleExport(operation, 'worker', deps);
  expect(deps.publish).toHaveBeenCalledWith('file:///cas/video', {
    mediaId: 'job-1:video-1', displayName: 'job-1.mp4',
  });
  expect(deps.commitSuccess).toHaveBeenCalledWith(expect.objectContaining({
    galleryUri: 'content://media/external/video/7', keepPrivateCopy: true,
  }));
});

test('does not publish after the durable operation or task projection is deleted', async () => {
  const deps = setupExport();
  deps.canPublish.mockReturnValueOnce(false);
  await handleExport(operation, 'worker', deps);
  expect(deps.publish).not.toHaveBeenCalled();
  expect(deps.commitSuccess).not.toHaveBeenCalled();
});

test('replays native publication with the same stable identity', async () => {
  const deps = setupExport();
  await handleExport(operation, 'worker', deps);
  await handleExport({ ...operation, attempt: 2 }, 'worker', deps);
  expect(deps.publish).toHaveBeenNthCalledWith(1, 'file:///cas/video', { mediaId: 'job-1:video-1', displayName: 'job-1.mp4' });
  expect(deps.publish).toHaveBeenNthCalledWith(2, 'file:///cas/video', { mediaId: 'job-1:video-1', displayName: 'job-1.mp4' });
});

test('releases only the matching blob reference when private copy is disabled', async () => {
  const deps = setupExport();
  await handleExport({ ...operation, payload: { ...operation.payload, keepPrivateCopy: false } }, 'worker', deps);
  expect(deps.commitSuccess).toHaveBeenCalledWith(expect.objectContaining({
    blobSha256: 'a'.repeat(64), referenceOwnerId: 'job-1:video-1', keepPrivateCopy: false,
  }));
});

test('exposes a deterministic interruption seam after native publish and before SQLite commit', async () => {
  const deps = { ...setupExport(), afterPublish: jest.fn(async () => { throw new Error('SIMULATED_PROCESS_EXIT'); }) };
  await expect(handleExport(operation, 'worker', deps)).rejects.toThrow('SIMULATED_PROCESS_EXIT');
  expect(deps.publish).toHaveBeenCalledTimes(1);
  expect(deps.afterPublish).toHaveBeenCalledWith({ operationId: 'export-1', galleryUri: 'content://media/external/video/7' });
  expect(deps.commitSuccess).not.toHaveBeenCalled();
  expect(deps.retry).not.toHaveBeenCalled();
  expect(deps.finishFailure).not.toHaveBeenCalled();
});

test('durably exports a legacy private source without inventing or releasing a CAS reference', async () => {
  const deps = { ...setupExport(), removeLegacyPrivate: jest.fn(async () => undefined) };
  const legacy = {
    ...operation,
    payload: {
      assetId: 'job-1:video-1', artifactId: 'video-1', sourceUri: 'file:///legacy/video.mp4',
      sourceKind: 'legacy', keepPrivateCopy: false, displayName: 'job-1.mp4',
    },
  } as WorkflowOperation;
  await handleExport(legacy, 'worker', deps);
  expect(deps.commitSuccess).toHaveBeenCalledWith(expect.objectContaining({
    sourceKind: 'legacy', keepPrivateCopy: false,
  }));
  expect(deps.removeLegacyPrivate).toHaveBeenCalledWith('file:///legacy/video.mp4');
});

test('rejects a CAS export payload without a valid hash', async () => {
  const deps = setupExport();
  await handleExport({ ...operation, payload: { ...operation.payload, blobSha256: undefined } }, 'worker', deps);
  expect(deps.publish).not.toHaveBeenCalled();
  expect(deps.finishFailure).toHaveBeenCalledWith(
    expect.anything(), 'worker', undefined, expect.any(Number), expect.objectContaining({ code: 'EXPORT_NATIVE_FAILED' }),
  );
});

test('classifies missing source, transient native, and terminal native failures', async () => {
  const missing = setupExport();
  missing.assertSource.mockRejectedValueOnce(new Error('missing'));
  await handleExport(operation, 'worker', missing);
  expect(missing.finishFailure).toHaveBeenCalledWith(expect.anything(), 'worker', expect.anything(), expect.anything(), expect.objectContaining({ code: 'EXPORT_SOURCE_MISSING' }));
  expect(missing.publish).not.toHaveBeenCalled();

  const transient = setupExport();
  transient.publish.mockRejectedValueOnce(new Error('native temporarily unavailable'));
  await handleExport(operation, 'worker', transient);
  expect(transient.retry).toHaveBeenCalledWith(expect.anything(), 'worker', expect.anything(), expect.objectContaining({ error: expect.objectContaining({ code: 'EXPORT_NATIVE_RETRY' }) }));

  const terminal = setupExport();
  terminal.publish.mockRejectedValueOnce(new Error('permission denied'));
  await handleExport(operation, 'worker', terminal);
  expect(terminal.finishFailure).toHaveBeenCalledWith(expect.anything(), 'worker', expect.anything(), expect.anything(), expect.objectContaining({ code: 'EXPORT_NATIVE_FAILED' }));
});

test('commits every export projection and private-copy release in one SQLite transaction', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const operations = createOperationRepository(db as never);
    const tasks = createTaskRepository(db as never);
    const media = createSqliteMediaStore(db);
    const cas = createCasRepository(db as never);
    await tasks.upsert({
      id: 'job-1', prompt: 'result', status: 'SUCCESS', resolution: '768p竖', duration: 5,
      localUri: 'file:///cas/video', downloadState: 'DOWNLOADED', exportState: 'QUEUED', createdAt: 1, updatedAt: 2,
    });
    await media.upsert({
      id: 'job-1:video-1', taskId: 'job-1', artifactId: 'video-1', jobId: 'job-1', title: 'result', prompt: 'result',
      sourceUrl: 'https://cdn/video.mp4', localPath: 'file:///cas/video', mimeType: 'video/mp4', kind: 'video',
      status: 'downloaded', exportStatus: 'QUEUED', createdAt: 1, updatedAt: 2,
    });
    cas.upsertBlob({ sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/video', createdAt: 1, verifiedAt: 1 });
    cas.retain('a'.repeat(64), 'workflow_artifact', 'job-1:video-1', 1);
    cas.retain('a'.repeat(64), 'workflow_artifact', 'job-1:other', 1);
    operations.enqueue({ id: operation.id, kind: 'EXPORT', jobId: 'job-1', idempotencyKey: operation.idempotencyKey, payload: operation.payload, now: 1 });
    const claimed = operations.claimById(operation.id, 'worker', 1, 100);
    if (!claimed) throw new Error('claim failed');

    const store = createSqliteExportStore(db as never);
    const payload = operation.payload as ExportPayload;
    await store.markExporting(claimed, 'worker', payload, 40);
    await store.commitSuccess({
      operationId: operation.id, owner: 'worker', jobId: 'job-1', ...payload,
      keepPrivateCopy: false, galleryUri: 'content://media/external/video/7', referenceOwnerId: 'job-1:video-1', now: 50,
    });

    expect(db.getFirstSync("SELECT status, uri FROM media_deliveries WHERE asset_id='job-1:video-1'")).toEqual({ status: 'EXPORTED', uri: 'content://media/external/video/7' });
    await expect(media.get('job-1:video-1')).resolves.toMatchObject({ exportStatus: 'EXPORTED', localPath: undefined, status: 'queued' });
    await expect(tasks.get('job-1')).resolves.toMatchObject({ exportState: 'EXPORTED', galleryUri: 'content://media/external/video/7', localUri: undefined });
    expect(operations.get(operation.id)).toMatchObject({ state: 'SUCCEEDED' });
    expect(cas.hasReference('a'.repeat(64), 'workflow_artifact', 'job-1:video-1')).toBe(false);
    expect(cas.hasReference('a'.repeat(64), 'workflow_artifact', 'job-1:other')).toBe(true);
  } finally { db.close(); }
});
