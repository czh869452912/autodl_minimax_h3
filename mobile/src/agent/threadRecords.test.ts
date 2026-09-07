import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createLocalThreadStore } from './threadStore';

describe('entity thread persistence', () => {
  it('paginates 100 equal-time summaries without duplicates and searches Chinese titles literally', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      const store = createLocalThreadStore(db as never);
      for (let index = 0; index < 100; index++) await store.save({ threadId: `t-${String(index).padStart(3, '0')}`, messages: [{ id: 'u', role: 'user', content: index % 2 ? '城市夜景' : '产品100%_展示' }], state: {}, createdAt: 1, updatedAt: 2 });
      const pages = [...await store.listSummaries(), ...await store.listSummaries({ offset: 50 })];
      expect(new Set(pages.map(row => row.threadId)).size).toBe(100);
      expect(pages.map(row => row.threadId)).toEqual([...pages.map(row => row.threadId)].sort());
      expect(await store.listSummaries({ offset: 100 })).toEqual([]);
      expect(await store.listSummaries({ query: '100%_' })).toHaveLength(50);
      expect(await store.listSummaries({ query: '城市', offset: 40 })).toHaveLength(10);
    } finally { db.close(); }
  });

  it('keeps one blob for 1, 50 and 100 immutable versions with independent durable owners', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      const hash = 'a'.repeat(64);
      db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, 3, 'image/png', `cas/sha256/aa/${hash}`, 1, 1);
      const store = createLocalThreadStore(db as never);
      for (const count of [1, 50, 100]) {
        await store.save({ threadId: 'versions', messages: [], state: { h3Versions: Array.from({ length: count }, (_, index) => ({ id: `v-${index}`, promptText: `prompt-${index}`, images: [{ id: 'image', uri: `asset://${hash}` }] })) }, createdAt: 1, updatedAt: count });
        expect(db.getAllSync('SELECT * FROM artifact_blobs')).toHaveLength(1);
        const versions = db.getAllSync<{ payload_json: string }>('SELECT payload_json FROM agent_versions');
        expect(versions).toHaveLength(count);
        expect(versions.every(row => row.payload_json.includes('asset://') && !row.payload_json.includes('base64'))).toBe(true);
        expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='agent_record'")).toHaveLength(count);
      }
      db.runSync('INSERT INTO artifact_blob_refs VALUES(?,?,?,?)', hash, 'task_input', 'task', 1);
      await store.remove('versions');
      expect(db.getAllSync('SELECT owner_type,owner_id FROM artifact_blob_refs')).toEqual([{ owner_type: 'task_input', owner_id: 'task' }]);
    } finally { db.close(); }
  });
  it('repairs an unambiguous missing legacy user ID and keeps that run binding on reload', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      const run = { id: 'failed-run', userMessageId: '', status: 'failed', startedAt: 1, endedAt: 2, messageIds: [], tools: [] };
      db.runSync('INSERT INTO agent_threads VALUES(?,?,?,?,?,?)', 'legacy-link', JSON.stringify([{ role: 'user', content: 'original' }]), JSON.stringify({ h3Runs: [run] }), 1, 2, null);
      const store = createLocalThreadStore(db as never);
      const loaded = await store.load('legacy-link');
      expect(loaded?.messages[0].id).toMatch(/^legacy-/);
      expect((loaded?.state as any).h3Runs[0].userMessageId).toBe(loaded?.messages[0].id);
      expect(await store.load('legacy-link')).toEqual(loaded);
      expect(db.getAllSync('SELECT * FROM agent_threads')).toHaveLength(0);
    } finally { db.close(); }
  });

  it('preserves the exact legacy source when a missing run binding is ambiguous', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      const messages = JSON.stringify([{ role: 'user', content: 'first' }, { role: 'user', content: 'second' }]);
      const state = JSON.stringify({ h3Runs: [{ id: 'failed-run', userMessageId: '', status: 'failed', startedAt: 1, messageIds: [], tools: [] }] });
      db.runSync('INSERT INTO agent_threads VALUES(?,?,?,?,?,?)', 'ambiguous-link', messages, state, 1, 2, null);
      const store = createLocalThreadStore(db as never);
      await expect(store.load('ambiguous-link')).rejects.toThrow();
      expect(db.getFirstSync('SELECT messages_json,state_json FROM agent_threads WHERE thread_id=?', 'ambiguous-link')).toEqual({ messages_json: messages, state_json: state });
      expect(db.getAllSync('SELECT * FROM agent_thread_index')).toHaveLength(0);
      expect(db.getAllSync('SELECT * FROM agent_messages')).toHaveLength(0);
    } finally { db.close(); }
  });

  it('migrates legacy JSON once and writes only changed messages', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      db.runSync('INSERT INTO agent_threads VALUES (?,?,?,?,?,?)', 't', JSON.stringify([{ id: 'u', role: 'user', content: 'hello' }]), '{}', 1, 2, null);
      const store = createLocalThreadStore(db as never);
      const loaded = await store.load('t');
      expect(loaded?.messages).toHaveLength(1);
      expect(db.getFirstSync('SELECT * FROM agent_threads WHERE thread_id=?', 't')).toBeUndefined();
      const run = jest.spyOn(db, 'runAsync');
      await store.save({ ...loaded!, messages: [...loaded!.messages, { id: 'a', role: 'assistant', content: 'first' }], updatedAt: 3 });
      run.mockClear();
      await store.save({ ...loaded!, messages: [...loaded!.messages, { id: 'a', role: 'assistant', content: 'second' }], updatedAt: 4 });
      expect(run.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO agent_messages'))).toHaveLength(1);
      expect(await store.load('t')).toMatchObject({ messages: [{ content: 'hello' }, { content: 'second' }] });
    } finally { db.close(); }
  });

  it('preserves damaged legacy history and refuses to overwrite it with an empty thread', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      db.runSync('INSERT INTO agent_threads VALUES (?,?,?,?,?,?)', 'broken', '{', '{}', 1, 2, null);
      const store = createLocalThreadStore(db as never);
      await expect(store.load('broken')).rejects.toThrow('损坏');
      await expect(store.save({ threadId: 'broken', messages: [], state: {}, createdAt: 1, updatedAt: 2 })).rejects.toThrow('损坏');
      expect(db.getFirstSync<{ messages_json: string }>('SELECT * FROM agent_threads WHERE thread_id=?', 'broken')?.messages_json).toBe('{');
    } finally { db.close(); }
  });

  it('paginates without discarding versions and rolls back a failed entity update', async () => {
    const db = createInitializedRealSqliteTestDb();
    try {
      const store = createLocalThreadStore(db as never);
      const initial = { threadId: 't', messages: Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, role: 'user' as const, content: String(i) })), state: {}, createdAt: 1, updatedAt: 2 };
      await store.save(initial);
      expect(await store.listMessages('t', { limit: 10 })).toHaveLength(10);
      expect((await store.listMessages('t', { beforeSequence: 10, limit: 10 }))[0].id).toBe('m0');
      const original = db.runAsync.bind(db);
      jest.spyOn(db, 'runAsync').mockImplementation(async (sql, ...params) => {
        if (sql.startsWith('INSERT INTO agent_messages') && params[1] === 'failed') throw new Error('disk full');
        return original(sql, ...params);
      });
      await expect(store.save({ ...initial, messages: [...initial.messages, { id: 'failed', role: 'user', content: 'new' }], updatedAt: 3 })).rejects.toThrow('disk full');
      expect((await store.load('t'))?.messages).toHaveLength(60);
    } finally { db.close(); }
  });
});
