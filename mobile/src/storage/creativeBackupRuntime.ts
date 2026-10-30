import * as FileSystem from 'expo-file-system/legacy';
import { defaultDatabaseDirectory } from 'expo-sqlite';
import { sha256File } from '../native/media';
import type { AppDatabase } from './appDatabase';
import { createUserDatabaseBackup, databaseDirectoryUri, restoreFullDatabaseBackup } from './backup';
import { buildCreativeBackup, restoreCreativeBackup, parseCreativeBackup, type BackupFiles } from './fileBackup';
import { readPendingMaintenance } from './pendingMaintenance';

function runtimeFiles(): { root: string; files: BackupFiles } {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('PRIVATE_STORAGE_UNAVAILABLE');
  const absolute = (path: string) => path.startsWith('file://') ? path : `${root}${path}`;
  const files: BackupFiles = {
    async list() {
      const walk = async (prefix: string): Promise<string[]> => {
        const result: string[] = [];
        for (const name of await FileSystem.readDirectoryAsync(absolute(prefix))) {
          const path = `${prefix}${name}`;
          if (path === 'creative-backups' || path === 'SQLite' || path === 'tag-dictionaries') continue;
          const info = await FileSystem.getInfoAsync(absolute(path));
          if (!info.exists) throw new Error('BACKUP_SOURCE_CHANGED');
          if (info.isDirectory) result.push(...await walk(`${path}/`)); else result.push(path);
        }
        return result;
      };
      return walk('');
    },
    async size(path) { const info = await FileSystem.getInfoAsync(absolute(path)); return info.exists && !info.isDirectory ? info.size : undefined; },
    hash: path => sha256File(absolute(path)),
    async copy(from, to) {
      const target = absolute(to);
      await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/')), { intermediates: true });
      await FileSystem.copyAsync({ from: absolute(from), to: target });
    },
    read: path => FileSystem.readAsStringAsync(absolute(path)),
    write: (path, text) => FileSystem.writeAsStringAsync(absolute(path), text),
  };
  return { root, files };
}

export async function createCreativeFileBackup(db: AppDatabase, id: string) {
  const request = await readPendingMaintenance();
  if (request?.kind !== 'creative-backup' || request.id !== id) throw new Error('BACKUP_REQUIRES_STARTUP_MAINTENANCE');
  const { root, files } = runtimeFiles();
  const blobs = await db.getAllAsync<{ relative_path: string; sha256: string; byte_size: number }>('SELECT b.* FROM artifact_blobs b WHERE EXISTS(SELECT 1 FROM artifact_blob_refs r WHERE r.blob_sha256=b.sha256)');
  for (const blob of blobs) {
    if (await files.size(blob.relative_path) !== blob.byte_size || await files.hash(blob.relative_path) !== blob.sha256) throw new Error('BACKUP_REFERENCED_FILE_MISSING');
  }
  return buildCreativeBackup({ id, root, files, now: Date.now(), snapshot: async () => `${databaseDirectoryUri(defaultDatabaseDirectory)}/${createUserDatabaseBackup(db)}` });
}

export async function restoreCreativeFileBackup(db: AppDatabase, id: string) {
  const request = await readPendingMaintenance();
  if (request?.kind !== 'creative-restore' || request.id !== id) throw new Error('BACKUP_REQUIRES_STARTUP_MAINTENANCE');
  const { root, files } = runtimeFiles();
  return restoreCreativeBackup({ id, root, files, restoreDatabase: async path => {
    const name = `autodl-h3-manual-${Date.now()}.backup.db`;
    await files.copy(path, `${databaseDirectoryUri(defaultDatabaseDirectory)}/${name}`);
    restoreFullDatabaseBackup(db, name);
  } });
}

export async function listCreativeFileBackups() {
  const { root, files } = runtimeFiles();
  const directory = `${root}creative-backups/`;
  if (!(await FileSystem.getInfoAsync(directory)).exists) return [];
  const result: Array<{ id: string; createdAt: number; fileCount: number }> = [];
  for (const id of await FileSystem.readDirectoryAsync(directory)) {
    if (!/^[a-f0-9]{32}$/.test(id)) continue;
    try {
      const manifest = parseCreativeBackup(await files.read(`creative-backups/${id}/manifest.json`), id);
      result.push({ id, createdAt: manifest.createdAt, fileCount: manifest.files.length });
    } catch { /* Incomplete directories are not recoverable packages. */ }
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

/** Locate verified bytes only; this never activates the backup's database. */
export async function findCreativeBackupFile(hash: string): Promise<{ backupId: string; uri: string; size: number } | undefined> {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_CONTENT_HASH');
  const { root, files } = runtimeFiles();
  for (const backup of await listCreativeFileBackups()) {
    try {
      const manifest = parseCreativeBackup(await files.read(`creative-backups/${backup.id}/manifest.json`), backup.id);
      if (manifest.sourceRoot !== root) continue;
      for (const entry of manifest.files.filter(file => file.sha256 === hash)) {
        const path = `creative-backups/${backup.id}/files/${entry.path}`;
        if (await files.size(path) === entry.size && await files.hash(path) === hash) return { backupId: backup.id, uri: `${root}${path}`, size: entry.size };
      }
    } catch { /* Try another complete package after corruption or removal. */ }
  }
  return undefined;
}
