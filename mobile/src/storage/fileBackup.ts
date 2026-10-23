export type BackupFile = { path: string; size: number; sha256: string };
export type CreativeBackupManifest = { formatVersion: 1; id: string; sourceRoot: string; createdAt: number; database: BackupFile; files: BackupFile[] };
export type BackupFiles = {
  list(): Promise<string[]>;
  size(path: string): Promise<number | undefined>;
  hash(path: string): Promise<string>;
  copy(from: string, to: string): Promise<void>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
};
export function safeBackupPath(path: string): boolean {
  return Boolean(path) && !path.startsWith('/') && !/[\\:\u0000-\u001f]/.test(path) && path.split('/').every(p => p !== '' && p !== '.' && p !== '..');
}
export function parseCreativeBackup(raw: string, id: string): CreativeBackupManifest {
  const value = JSON.parse(raw) as CreativeBackupManifest;
  if (value?.formatVersion !== 1 || value.id !== id || !/^[a-f0-9]{32}$/.test(id) || typeof value.sourceRoot !== 'string' || !Number.isSafeInteger(value.createdAt) || !Array.isArray(value.files)) throw new Error('BACKUP_MANIFEST_INVALID');
  const paths = new Set<string>();
  for (const file of [value.database, ...value.files]) {
    if (!file || !safeBackupPath(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || paths.has(file.path)) throw new Error('BACKUP_MANIFEST_INVALID');
    paths.add(file.path);
  }
  if (value.database.path !== 'snapshot.db' || value.files.some(f => f.path.startsWith('creative-backups/') || f.path.startsWith('SQLite/'))) throw new Error('BACKUP_MANIFEST_INVALID');
  return value;
}

/** Runs only inside startup maintenance, while all app writers and the native monitor are stopped. */
export async function buildCreativeBackup(input: { id: string; root: string; now: number; files: BackupFiles; snapshot(): Promise<string> }) {
  if (!/^[a-f0-9]{32}$/.test(input.id)) throw new Error('BACKUP_ID_INVALID');
  const prefix = `creative-backups/${input.id}`;
  let completed: string | undefined;
  try { completed = await input.files.read(`${prefix}/manifest.json`); } catch { /* not published yet */ }
  if (completed !== undefined) {
    const manifest = parseCreativeBackup(completed, input.id);
    if (manifest.sourceRoot !== input.root) throw new Error('BACKUP_ROOT_MISMATCH');
    for (const file of [manifest.database, ...manifest.files]) {
      const path = file === manifest.database ? `${prefix}/snapshot.db` : `${prefix}/files/${file.path}`;
      if (await input.files.size(path) !== file.size || await input.files.hash(path) !== file.sha256) throw new Error('BACKUP_INTEGRITY_FAILED');
    }
    return manifest;
  }
  const describe = async (path: string, source: string): Promise<BackupFile> => {
    const size = await input.files.size(source);
    if (size === undefined) throw new Error('BACKUP_FILE_MISSING');
    return { path, size, sha256: await input.files.hash(source) };
  };
  const snapshot = await input.snapshot();
  await input.files.copy(snapshot, `${prefix}/snapshot.db`);
  const database = await describe('snapshot.db', `${prefix}/snapshot.db`);
  const files: BackupFile[] = [];
  for (const path of (await input.files.list()).sort()) {
    if (!safeBackupPath(path)) throw new Error('BACKUP_SOURCE_PATH_INVALID');
    const before = await describe(path, path);
    await input.files.copy(path, `${prefix}/files/${path}`);
    const copied = await describe(path, `${prefix}/files/${path}`);
    if (before.sha256 !== copied.sha256 || before.size !== copied.size) throw new Error('BACKUP_SOURCE_CHANGED');
    files.push(copied);
  }
  const manifest: CreativeBackupManifest = { formatVersion: 1, id: input.id, sourceRoot: input.root, createdAt: input.now, database, files };
  parseCreativeBackup(JSON.stringify(manifest), input.id);
  // Completion is published last; incomplete directories are never listed as backups.
  await input.files.write(`${prefix}/manifest.json`, JSON.stringify(manifest));
  return manifest;
}

export async function restoreCreativeBackup(input: { id: string; root: string; files: BackupFiles; restoreDatabase(path: string): Promise<void> }) {
  if (!/^[a-f0-9]{32}$/.test(input.id)) throw new Error('BACKUP_ID_INVALID');
  const prefix = `creative-backups/${input.id}`;
  const manifest = parseCreativeBackup(await input.files.read(`${prefix}/manifest.json`), input.id);
  // First release supports local restore. Cross-install path remapping is not silently guessed.
  if (manifest.sourceRoot !== input.root) throw new Error('BACKUP_ROOT_MISMATCH');
  for (const file of [manifest.database, ...manifest.files]) {
    const source = file === manifest.database ? `${prefix}/snapshot.db` : `${prefix}/files/${file.path}`;
    if (await input.files.size(source) !== file.size || await input.files.hash(source) !== file.sha256) throw new Error('BACKUP_INTEGRITY_FAILED');
    if (file !== manifest.database && await input.files.size(file.path) !== undefined && await input.files.hash(file.path) !== file.sha256) throw new Error('BACKUP_DESTINATION_CONFLICT');
  }
  for (const file of manifest.files) {
    if (await input.files.size(file.path) === undefined) await input.files.copy(`${prefix}/files/${file.path}`, file.path);
    if (await input.files.size(file.path) !== file.size || await input.files.hash(file.path) !== file.sha256) throw new Error('BACKUP_RESTORE_COPY_FAILED');
  }
  // Existing files are never overwritten. A failure above leaves the old database intact.
  await input.restoreDatabase(`${prefix}/snapshot.db`);
  return manifest;
}
