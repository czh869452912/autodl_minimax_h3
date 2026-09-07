import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createLocalThreadStore } from './threadStore';

it.each([
  { count: 10, bytes: 1, error: '9' },
  { count: 3, bytes: 18 * 1024 * 1024, error: '50MB' },
  { count: 1, bytes: 21 * 1024 * 1024, error: '20MB' },
])('rejects $count attachment instances of $bytes actual bytes without changing the draft or history', async ({ count, bytes, error }) => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const hash = 'f'.repeat(64);
    db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, bytes, 'image/png', `cas/sha256/ff/${hash}`, 1, 1);
    const attachments = Array.from({ length: count }, (_, i) => ({ id: `image-${i}`, size: 1, status: 'ready', source: { type: 'url', value: `asset://${hash}` } }));
    const store = createLocalThreadStore(db as never);
    const snapshot = { threadId: 'budget', messages: [{ id: 'prior-user', role: 'user' as const, content: 'earlier message' }], state: { h3Composer: { text: 'unsent draft', attachments, revision: 3 }, h3Runs: [{ id: 'prior-run', userMessageId: 'prior-user', status: 'failed', startedAt: 1, messageIds: [], tools: [] }] }, createdAt: 1, updatedAt: 1 };
    await store.save(snapshot);
    const before = await store.load(snapshot.threadId);
    const command = { id: 'over-budget', runId: 'must-not-exist', draftRevision: 3, message: { id: 'new-user', role: 'user' as const, content: 'unsent draft', attachments } };
    await expect(store.accept(snapshot, command)).rejects.toThrow(error);
    expect(await store.load(snapshot.threadId)).toEqual(before);
    expect(db.getAllSync('SELECT * FROM agent_submissions')).toHaveLength(0);
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='agent_import'")).toHaveLength(0);
  } finally { db.close(); }
});

it('applies actual image limits only to the accepted message and permits exactly 50 MiB', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const large = 'a'.repeat(64), small = 'b'.repeat(64);
    for (const [hash, bytes] of [[large, 20 * 1024 * 1024], [small, 10 * 1024 * 1024]] as const) db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, bytes, 'image/png', `cas/sha256/${hash.slice(0, 2)}/${hash}`, 1, 1);
    const image = (id: string, hash: string) => ({ id, size: 1, status: 'ready', source: { type: 'url', value: `asset://${hash}` } });
    const store = createLocalThreadStore(db as never);
    const snapshot = { threadId: 'history-budget', messages: Array.from({ length: 3 }, (_, i) => ({ id: `prior-${i}`, role: 'user' as const, content: 'prior round', attachments: [image(`prior-image-${i}`, large)] })), state: { h3Composer: { text: 'new round', revision: 1 } }, createdAt: 1, updatedAt: 1 };
    await store.save(snapshot);
    const command = { id: 'at-limit', runId: 'new-run', draftRevision: 1, message: { id: 'new-user', role: 'user' as const, content: 'new round', attachments: [image('first', large), image('second', large), image('third', small)] } };
    await expect(store.accept(snapshot, command)).resolves.toMatchObject({ submissionId: command.id });
    expect((await store.load(snapshot.threadId))?.messages).toHaveLength(4);
    expect(db.getAllSync('SELECT * FROM agent_submissions')).toHaveLength(1);
  } finally { db.close(); }
});

it('accepts user and queued run atomically, replays a command without duplicating them', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const store = createLocalThreadStore(db as never);
    const snapshot = { threadId: 't', messages: [], state: { h3Composer: { text: 'draft', revision: 3 } }, createdAt: 1, updatedAt: 1 };
    await store.save(snapshot);
    const command = { id: 'submission', message: { id: 'user', role: 'user' as const, content: 'draft' }, draftRevision: 3, runId: 'run' };
    await store.accept(snapshot, command);
    await store.accept(snapshot, command);
    const saved = await store.load('t');
    expect(saved?.messages).toHaveLength(1);
    expect(saved?.state).toMatchObject({ h3Composer: { text: '', revision: 4 }, h3Runs: [{ id: 'run', status: 'queued' }] });
    const failing = jest.spyOn(db, 'runAsync').mockImplementation(async (sql, ...params) => {
      if (sql.startsWith('INSERT INTO agent_runs')) throw new Error('disk full');
      return db.runSync(sql, ...params);
    });
    await expect(store.accept(saved!, { ...command, id: 's2', runId: 'r2', message: { ...command.message, id: 'u2' } })).rejects.toThrow('disk full');
    failing.mockRestore();
    expect((await store.load('t'))?.messages).toHaveLength(1);
  } finally { db.close(); }
});
