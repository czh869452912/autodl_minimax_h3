const mockFiles = new Map<string, { text?: string; hash?: string; size: number }>();
const mockCopy = jest.fn();
const mockRestore = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///private/',
  getInfoAsync: async (uri: string) => uri === 'file:///private/creative-backups/' ? { exists: true, isDirectory: true } : mockFiles.has(uri) ? { exists: true, isDirectory: false, size: mockFiles.get(uri)!.size } : { exists: false },
  readDirectoryAsync: async () => ['1'.repeat(32), '2'.repeat(32)],
  readAsStringAsync: async (uri: string) => { const item = mockFiles.get(uri); if (!item?.text) throw new Error('missing'); return item.text; },
  copyAsync: (...args: unknown[]) => mockCopy(...args),
}));
jest.mock('../native/media', () => ({ sha256File: async (uri: string) => mockFiles.get(uri)?.hash }));
jest.mock('./backup', () => ({ restoreFullDatabaseBackup: (...args: unknown[]) => mockRestore(...args) }));
jest.mock('expo-sqlite', () => ({ defaultDatabaseDirectory: '/db' }));
import { findCreativeBackupFile } from './creativeBackupRuntime';

const hash = 'a'.repeat(64);
function backup(id: string, contentHash: string, root = 'file:///private/') {
  const prefix = `file:///private/creative-backups/${id}`;
  mockFiles.set(`${prefix}/manifest.json`, { size: 1, text: JSON.stringify({ formatVersion: 1, id, sourceRoot: root, createdAt: Number(id[0]), database: { path: 'snapshot.db', size: 10, sha256: 'b'.repeat(64) }, files: [{ path: 'cas/original', size: 10, sha256: hash }] }) });
  mockFiles.set(`${prefix}/files/cas/original`, { size: 10, hash: contentHash });
}
beforeEach(() => { mockFiles.clear(); mockCopy.mockClear(); mockRestore.mockClear(); });

test('finds verified older bytes when a newer backup file is corrupt without restoring any database', async () => {
  backup('1'.repeat(32), hash); backup('2'.repeat(32), 'c'.repeat(64));
  expect(await findCreativeBackupFile(hash)).toEqual({ backupId: '1'.repeat(32), uri: `file:///private/creative-backups/${'1'.repeat(32)}/files/cas/original`, size: 10 });
  expect(mockCopy).not.toHaveBeenCalled(); expect(mockRestore).not.toHaveBeenCalled();
});
test('unavailable or foreign-installation backup never becomes a claimed recovery source', async () => {
  backup('1'.repeat(32), hash, 'file:///other-installation/');
  expect(await findCreativeBackupFile(hash)).toBeUndefined();
});
