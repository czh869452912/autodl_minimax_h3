import { createHash } from 'crypto';
import { buildCreativeBackup, restoreCreativeBackup, parseCreativeBackup, type BackupFiles } from './fileBackup';

const id = 'a'.repeat(32);
function fixture() {
  const data = new Map<string, string>([['source.db', 'database'], ['cas/image', 'original image'], ['attachments/audio', 'audio']]);
  const files: BackupFiles = {
    list: async () => ['cas/image', 'attachments/audio'],
    size: async path => data.has(path) ? Buffer.byteLength(data.get(path)!) : undefined,
    hash: async path => { if (!data.has(path)) throw new Error('missing'); return createHash('sha256').update(data.get(path)!).digest('hex'); },
    copy: async (from, to) => { if (!data.has(from)) throw new Error('missing'); data.set(to, data.get(from)!); },
    read: async path => { if (!data.has(path)) throw new Error('missing'); return data.get(path)!; },
    write: async (path, text) => { data.set(path, text); },
  };
  const build = () => buildCreativeBackup({ id, root: 'private/', now: 10, files, snapshot: async () => 'source.db' });
  const restored = jest.fn(async () => {});
  const restore = () => restoreCreativeBackup({ id, root: 'private/', files, restoreDatabase: restored });
  return { data, files, build, restore, restored };
}

test('a backup restores missing private files before restoring the isolated database', async () => {
  const f = fixture();
  const manifest = await f.build();
  expect(manifest.files).toHaveLength(2);
  f.data.delete('cas/image'); f.data.delete('attachments/audio');
  f.restored.mockImplementation(async () => { expect(f.data.get('cas/image')).toBe('original image'); expect(f.data.get('attachments/audio')).toBe('audio'); });
  await f.restore();
  expect(f.restored).toHaveBeenCalledWith(`creative-backups/${id}/snapshot.db`);
});

test('corrupted backup or a conflicting live file never replaces live data', async () => {
  const f = fixture(); await f.build();
  f.data.set('cas/image', 'new original');
  await expect(f.restore()).rejects.toThrow('BACKUP_DESTINATION_CONFLICT');
  expect(f.data.get('cas/image')).toBe('new original');
  f.data.delete('cas/image');
  f.data.set(`creative-backups/${id}/files/cas/image`, 'corrupt');
  await expect(f.restore()).rejects.toThrow('BACKUP_INTEGRITY_FAILED');
  expect(f.data.has('cas/image')).toBe(false);
  expect(f.restored).not.toHaveBeenCalled();
});

test('copy failure cannot publish a completed manifest', async () => {
  const f = fixture();
  const copy = f.files.copy;
  f.files.copy = async (from, to) => { if (from === 'cas/image') throw new Error('disk full'); await copy(from, to); };
  await expect(f.build()).rejects.toThrow('disk full');
  expect(f.data.has(`creative-backups/${id}/manifest.json`)).toBe(false);
  f.files.copy = copy;
  await f.build();
  f.data.delete('cas/image');
  let failed = false;
  f.files.copy = async (from, to) => { if (!failed) { failed = true; throw new Error('interrupted'); } await copy(from, to); };
  await expect(f.restore()).rejects.toThrow('interrupted');
  expect(f.restored).not.toHaveBeenCalled();
  await f.restore();
  expect(f.restored).toHaveBeenCalledTimes(1);
});

test.each(['../escape', '/absolute', 'a/../../b', 'a\\b', 'creative-backups/other', 'SQLite/db'])('manifest rejects unsafe file path %s', async path => {
  const f = fixture(); const manifest = await f.build();
  manifest.files[0].path = path;
  expect(() => parseCreativeBackup(JSON.stringify(manifest), id)).toThrow('BACKUP_MANIFEST_INVALID');
});

test('restore does not silently remap a different installation root', async () => {
  const f = fixture(); await f.build();
  await expect(restoreCreativeBackup({ id, root: 'other/', files: f.files, restoreDatabase: f.restored })).rejects.toThrow('BACKUP_ROOT_MISMATCH');
  expect(f.restored).not.toHaveBeenCalled();
});

test('a completed backup is immutable if startup retries after completion', async () => {
  const f = fixture(); const first = await f.build();
  f.data.set('source.db', 'newer db'); f.data.set('cas/image', 'newer file');
  expect(await f.build()).toEqual(first);
  expect(f.data.get(`creative-backups/${id}/snapshot.db`)).toBe('database');
});
