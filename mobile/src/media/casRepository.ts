import type { SQLiteDatabase } from 'expo-sqlite';
import { assertAppDatabaseWritable } from '../storage/database';
import type { ArtifactBlob } from './cas';

type BlobRow = { sha256: string; byte_size: number; mime: string; relative_path: string; created_at: number; verified_at: number };

function mapBlob(row: BlobRow): ArtifactBlob {
  return { sha256: row.sha256, byteSize: Number(row.byte_size), mime: row.mime, relativePath: row.relative_path, createdAt: Number(row.created_at), verifiedAt: Number(row.verified_at) };
}

function changes(result: unknown): number {
  return Number((result as { changes?: number | bigint } | undefined)?.changes ?? 0);
}

export function createCasRepository(db: SQLiteDatabase) {
  return {
    upsertBlob(blob: ArtifactBlob): void {
      assertAppDatabaseWritable(db);
      db.runSync(
        'INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET verified_at=MAX(artifact_blobs.verified_at, excluded.verified_at)',
        blob.sha256, blob.byteSize, blob.mime, blob.relativePath, blob.createdAt, blob.verifiedAt,
      );
    },
    retain(sha256: string, ownerType: string, ownerId: string, now: number): void {
      assertAppDatabaseWritable(db);
      db.runSync('INSERT OR IGNORE INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)', sha256, ownerType, ownerId, now);
    },
    release(sha256: string, ownerType: string, ownerId: string): void {
      assertAppDatabaseWritable(db);
      db.runSync('DELETE FROM artifact_blob_refs WHERE blob_sha256 = ? AND owner_type = ? AND owner_id = ?', sha256, ownerType, ownerId);
    },
    hasReference(sha256: string, ownerType: string, ownerId: string): boolean {
      return Boolean(db.getFirstSync(
        'SELECT 1 AS present FROM artifact_blob_refs WHERE blob_sha256 = ? AND owner_type = ? AND owner_id = ? LIMIT 1',
        sha256, ownerType, ownerId,
      ));
    },
    listUnreferenced(limit: number): ArtifactBlob[] {
      return db.getAllSync<BlobRow>(
        'SELECT b.* FROM artifact_blobs b WHERE NOT EXISTS (SELECT 1 FROM artifact_blob_refs r WHERE r.blob_sha256 = b.sha256) ORDER BY b.created_at ASC, b.sha256 ASC LIMIT ?',
        Math.max(0, Math.floor(limit)),
      ).map(mapBlob);
    },
    removeBlobIfUnreferenced(sha256: string): boolean {
      assertAppDatabaseWritable(db);
      return changes(db.runSync('DELETE FROM artifact_blobs WHERE sha256 = ? AND NOT EXISTS (SELECT 1 FROM artifact_blob_refs WHERE blob_sha256 = ?)', sha256, sha256)) === 1;
    },
  };
}

export type CasRepository = ReturnType<typeof createCasRepository>;
