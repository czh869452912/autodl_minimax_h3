import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createAttachmentStore, releaseExpiredAttachmentImports, validateImageBudget } from '../media/attachments';
import { createCasRepository } from '../media/casRepository';
import CryptoJS from 'crypto-js';

it('externalizes long run traces in bounded chunks and hydrates exact Unicode content', async () => {
  const db = createInitializedRealSqliteTestDb();
  const files = new Map<string, string>();
  const importText = jest.fn(async (text: string) => {
    const hash = CryptoJS.SHA256(text).toString(); files.set(hash, text);
    return { sha256: hash, byteSize: CryptoJS.enc.Utf8.parse(text).sigBytes, mime: 'text/plain', relativePath: `cas/sha256/${hash.slice(0, 2)}/${hash}` };
  });
  try {
    const assets = createAttachmentStore(db as never, { importText, readText: async uri => files.get(uri.split('/').at(-1)!)! });
    const text = 'x'.repeat(65535) + String.fromCodePoint(0x1F600) + 'z'.repeat(100000);
    const input = { tools: [{ id: 'tool', name: 'read_file', startedAt: 1, output: text, arguments: 'a'.repeat(6000) }], activities: [{ id: 'r', kind: 'reasoning', messageId: 'm', text }] };
    const stored = await assets.externalize(input);
    expect(JSON.stringify(stored.value).length).toBeLessThan(2000);
    expect(importText.mock.calls.every(([chunk]) => chunk.length <= 65536)).toBe(true);
    expect(await assets.hydrate(stored.value)).toEqual(input);
    await assets.retain(db as never, 'agent_record', 'run', stored.hashes);
    await stored.releaseStaging();
    expect(createCasRepository(db as never).listUnreferenced(Date.now() + 1)).toHaveLength(0);
  } finally { db.close(); }
});

it('reimports mutable local paths and rejects oversized workspace references before reading', async () => {
  const db = createInitializedRealSqliteTestDb();
  const hash = 'f'.repeat(64);
  const importImage = jest.fn(async () => ({ sha256: hash, byteSize: 3, mime: 'image/png', relativePath: `cas/sha256/ff/${hash}` }));
  const readText = jest.fn(async () => 'text');
  try {
    const assets = createAttachmentStore(db as never, { importImage, readText });
    for (let i = 0; i < 2; i++) {
      const stored = await assets.externalize({ type: 'url', value: 'file:///mutable.png', mimeType: 'image/png' });
      await stored.releaseStaging();
    }
    expect(importImage).toHaveBeenCalledTimes(2);
    db.runSync('UPDATE artifact_blobs SET mime=?,byte_size=? WHERE sha256=?', 'text/plain', 1024 * 1024 + 1, hash);
    await expect(assets.hydrate({ contentAsset: `asset://${hash}` })).rejects.toThrow('工作区文件');
    expect(readText).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('reclaims crashed staging owners without releasing live imports or durable references', async () => {
  const db = createInitializedRealSqliteTestDb();
  const expired = 'c'.repeat(64), live = 'd'.repeat(64), durable = 'e'.repeat(64);
  try {
    for (const hash of [expired, live, durable]) db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, 3, 'image/png', `cas/sha256/${hash.slice(0, 2)}/${hash}`, 1, 1);
    for (const [hash, owner] of [[expired, 'crashed'], [live, 'active'], [durable, 'old-owner']]) db.runSync('INSERT INTO artifact_blob_refs VALUES(?,?,?,?)', hash, 'agent_import', owner, 1);
    db.runSync('INSERT INTO artifact_blob_refs VALUES(?,?,?,?)', durable, 'task_input', 'task', 1);
    db.runSync('INSERT INTO app_scheduler_leases VALUES(?,?,?)', 'agent-import:crashed', 'crashed', 99);
    db.runSync('INSERT INTO app_scheduler_leases VALUES(?,?,?)', 'agent-import:active', 'active', 101);
    await releaseExpiredAttachmentImports(db as never, 100);
    expect(createCasRepository(db as never).listUnreferenced(100).map(blob => blob.sha256)).toEqual([expired]);
    expect(db.getAllSync('SELECT owner_type,owner_id FROM artifact_blob_refs ORDER BY owner_type')).toEqual([
      { owner_type: 'agent_import', owner_id: 'active' },
      { owner_type: 'task_input', owner_id: 'task' },
    ]);
    expect(db.getAllSync('SELECT lease_key FROM app_scheduler_leases')).toEqual([{ lease_key: 'agent-import:active' }]);
  } finally { db.close(); }
});

it('externalizes repeated image bytes once and retains each owner independently', async () => {
  const db = createInitializedRealSqliteTestDb();
  const hash = 'a'.repeat(64);
  const importImage = jest.fn(async () => ({ sha256: hash, byteSize: 3, mime: 'image/png', relativePath: `cas/sha256/aa/${hash}` }));
  try {
    const assets = createAttachmentStore(db as never, { importImage, resolveUri: value => `file:///document/${value}` });
    const value = { source: { type: 'data', value: 'AQID', mimeType: 'image/png' }, versions: [{ uri: 'data:image/png;base64,AQID' }] };
    const stored = await assets.externalize(value);
    expect(JSON.stringify(stored.value)).not.toContain('AQID');
    expect(importImage).toHaveBeenCalledTimes(1);
    await assets.retain(db as never, 'message', 'm', stored.hashes);
    await assets.retain(db as never, 'version', 'v', stored.hashes);
    await stored.releaseStaging();
    await assets.release(db as never, 'message', 'm');
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(1);
    const restored = await assets.hydrate(stored.value);
    expect(restored).toMatchObject({ source: { type: 'url', value: expect.stringContaining('/cas/sha256/') } });
  } finally { db.close(); }
});

it('enforces aggregate and per-image budgets including reserved uploads', () => {
  expect(() => validateImageBudget([{ size: 21 * 1024 * 1024 }])).toThrow('20');
  expect(() => validateImageBudget(Array.from({ length: 3 }, () => ({ size: 18 * 1024 * 1024 })))).toThrow('50');
  expect(() => validateImageBudget(Array.from({ length: 10 }, () => ({ size: 1 })))).toThrow('9');
});

it('stores workspace text once as CAS content and hydrates its exact text', async () => {
  const db = createInitializedRealSqliteTestDb();
  const hash = 'b'.repeat(64);
  const importText = jest.fn(async () => ({ sha256: hash, byteSize: 5, mime: 'text/plain', relativePath: `cas/sha256/bb/${hash}` }));
  try {
    const assets = createAttachmentStore(db as never, { importText, readText: async () => 'hello' });
    const workspace = { schemaVersion: 1, graphVersion: 'v1', files: { '/note': { content: 'hello', mimeType: 'text/plain' } } };
    const stored = await assets.externalize([workspace, workspace]);
    expect(JSON.stringify(stored.value)).not.toContain('hello');
    expect(importText).toHaveBeenCalledTimes(1);
    expect(await assets.hydrate(stored.value)).toEqual([workspace, workspace]);
    await stored.releaseStaging();
  } finally { db.close(); }
});
