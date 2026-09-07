import { createPromptDraftStore } from './promptDraft';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';

it('round trips text-only drafts and preserves an applied draft until explicit discard', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const store = createPromptDraftStore(db as never, () => 10000);
    const saved = await store.save({ prompt: 'A crane shot.', attachmentIds: [] });
    expect(await store.read(saved.id)).toMatchObject({ prompt: 'A crane shot.', status: 'ready' });
    expect(await store.consume(saved.id)).toMatchObject({ id: saved.id, status: 'applied' });
    expect(await store.read(saved.id)).not.toBeNull();
    await store.discard(saved.id);
    expect(await store.read(saved.id)).toBeNull();
  } finally { db.close(); }
});

it('reads legacy arrays and rejects malformed handoffs without deleting their source', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const store = createPromptDraftStore(db as never, () => 10000);
    db.runSync('INSERT INTO prompt_drafts VALUES(?,?,?,?)', 'legacy', 'old prompt', '["image1",12]', 10000);
    expect(await store.read('legacy')).toMatchObject({ attachmentIds: ['image1'] });
    for (const [id, payload] of [['broken', JSON.stringify({ version: 1, attachmentIds: [], handoff: { prompt: 'new prompt' } })], ['corrupt', '{"version":1']]) {
      db.runSync('INSERT INTO prompt_drafts VALUES(?,?,?,?)', id, 'new prompt', payload, 10000);
      await expect(store.read(id)).rejects.toThrow('交接');
      expect(db.getFirstSync('SELECT * FROM prompt_drafts WHERE id=?', id)).toBeDefined();
    }
  } finally { db.close(); }
});
