import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createCasRepository } from './casRepository';

const blob = { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 1, verifiedAt: 1 };

test('references are idempotent and referenced blobs are never listed or removed', () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const repository = createCasRepository(db as never);
    repository.upsertBlob(blob);
    repository.retain(blob.sha256, 'workflow_artifact', 'job-1:video-1', 10);
    repository.retain(blob.sha256, 'workflow_artifact', 'job-1:video-1', 11);
    expect(repository.listUnreferenced(10)).toEqual([]);
    expect(repository.removeBlobIfUnreferenced(blob.sha256)).toBe(false);
    repository.release(blob.sha256, 'workflow_artifact', 'job-1:video-1');
    expect(repository.listUnreferenced(10)).toEqual([blob]);
    expect(repository.removeBlobIfUnreferenced(blob.sha256)).toBe(true);
    expect(repository.listUnreferenced(10)).toEqual([]);
  } finally { db.close(); }
});
