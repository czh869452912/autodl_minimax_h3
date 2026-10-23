import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createId } from '../ids';

export type FileResource = { id: string; version_id: string; role: string; expected_sha256: string | null; blob_sha256: string | null; state: string; revision: number; relative_path: string | null; mime: string | null; updated_at: number };
export function createFileResources(db: AppDatabase, deps: { now(): number; verify(path: string, hash: string): Promise<boolean> }) {
  const read = (versionId: string) => db.getFirstAsync<FileResource>(`SELECT r.*,b.relative_path,b.mime FROM creative_file_resources r LEFT JOIN artifact_blobs b ON b.sha256=r.blob_sha256 WHERE r.version_id=? AND r.role='original'`, versionId);
  return {
    read,
    async verify(versionId: string) {
      const resource = await read(versionId);
      if (!resource || !resource.blob_sha256 || !resource.relative_path) return resource;
      // Never turn an active foreground copy into a failed attempt.
      if (resource.state === 'RESTORING' && deps.now() - resource.updated_at < 600000) return resource;
      let available = false;
      try { available = await deps.verify(resource.relative_path, resource.expected_sha256 ?? resource.blob_sha256); } catch { /* missing/corrupt */ }
      await withWriteTransaction(db, async tx => {
        const changed = await tx.runAsync('UPDATE creative_file_resources SET state=?,last_verified_at=?,error_code=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?', available ? 'AVAILABLE' : 'MISSING', deps.now(), available ? null : 'FILE_MISSING_OR_CORRUPT', deps.now(), resource.id, resource.revision);
        if (Number(changed.changes) === 1) await tx.runAsync("UPDATE creative_file_attempts SET state=?,completed_at=?,error_code=? WHERE resource_id=? AND state='RESTORING'", available ? 'SUCCEEDED' : 'FAILED', deps.now(), available ? null : 'RESTORE_INTERRUPTED', resource.id);
      });
      return read(versionId);
    },
    async restore(versionId: string, input: { sourceUri: string; backupId?: string; importFile(): Promise<{ hash: string; release(): Promise<void> }> }) {
      if (!/^(file|content):\/\//.test(input.sourceUri)) throw new Error('LOCAL_RESTORE_SOURCE_REQUIRED');
      if (input.backupId && !/^[a-f0-9]{32}$/.test(input.backupId)) throw new Error('INVALID_BACKUP_ID');
      const attemptId = createId();
      const started = await withWriteTransaction(db, async tx => {
        const resource = await tx.getFirstAsync<FileResource>("SELECT * FROM creative_file_resources WHERE version_id=? AND role='original'", versionId);
        if (!resource?.expected_sha256) throw new Error('RESTORE_HASH_UNKNOWN');
        if (resource.state === 'RESTORING' && deps.now() - resource.updated_at < 600000) throw new Error('RESTORE_IN_PROGRESS');
        await tx.runAsync("UPDATE creative_file_attempts SET state='FAILED',completed_at=?,error_code='RESTORE_INTERRUPTED' WHERE resource_id=? AND state='RESTORING'", deps.now(), resource.id);
        await tx.runAsync("INSERT INTO creative_file_attempts(id,resource_id,state,started_at) VALUES(?,?,'RESTORING',?)", attemptId, resource.id, deps.now());
        await tx.runAsync("UPDATE creative_file_resources SET state='RESTORING',revision=revision+1,updated_at=?,error_code=NULL WHERE id=?", deps.now(), resource.id);
        return { ...resource, revision: resource.revision + 1 };
      });
      let staged: Awaited<ReturnType<typeof input.importFile>> | undefined;
      try {
        staged = await input.importFile();
        if (staged.hash !== started.expected_sha256) throw new Error('RESTORE_CONTENT_MISMATCH');
        const blob = await db.getFirstAsync<{ relative_path: string }>('SELECT relative_path FROM artifact_blobs WHERE sha256=?', staged.hash);
        if (!blob || !await deps.verify(blob.relative_path, staged.hash)) throw new Error('RESTORE_VERIFY_FAILED');
        await withWriteTransaction(db, async tx => {
          const result = await tx.runAsync("UPDATE creative_file_resources SET blob_sha256=?,state='AVAILABLE',last_verified_at=?,error_code=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='RESTORING'", staged!.hash, deps.now(), deps.now(), started.id, started.revision);
          if (Number(result.changes) !== 1) throw new Error('RESOURCE_REVISION_CONFLICT');
          await tx.runAsync("UPDATE creative_file_attempts SET state='SUCCEEDED',completed_at=? WHERE id=?", deps.now(), attemptId);
          await tx.runAsync("INSERT INTO creative_recovery_sources(id,resource_id,kind,locator_json,persisted_permission,created_at) VALUES(?,?,?,?,?,?)", createId(), started.id, input.backupId ? 'backup' : 'import_uri', JSON.stringify({ uri: input.sourceUri, ...(input.backupId ? { backupId: input.backupId } : {}) }), input.backupId ? 1 : 0, deps.now());
        });
      } catch (error) {
        const code = error instanceof Error && error.message === 'RESTORE_CONTENT_MISMATCH' ? error.message : 'RESTORE_FAILED';
        await withWriteTransaction(db, async tx => {
          await tx.runAsync("UPDATE creative_file_attempts SET state='FAILED',completed_at=?,error_code=? WHERE id=?", deps.now(), code, attemptId);
          await tx.runAsync("UPDATE creative_file_resources SET state='MISSING',error_code=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?", code, deps.now(), started.id, started.revision);
        });
        throw error;
      } finally { await staged?.release(); }
      return { attemptId, resource: await read(versionId) };
    },
  };
}
