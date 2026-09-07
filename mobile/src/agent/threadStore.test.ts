import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createLocalThreadStore, sanitizePersistedValue } from './threadStore';

describe('local agent thread store', () => {
  let db: ReturnType<typeof createInitializedRealSqliteTestDb>;
  beforeEach(() => { db = createInitializedRealSqliteTestDb(); });
  afterEach(() => db.close());
  it('keeps later stream activity when an earlier rename is persisted afterward', async () => {
    const store = createLocalThreadStore(db as never);
    await store.save({ threadId: 'a', messages: [], state: {}, createdAt: 1, updatedAt: 40 });
    await store.rename('a', 'Renamed', 30);
    expect(await store.load('a')).toMatchObject({ customTitle: 'Renamed', updatedAt: 40 });
  });
  it('renames metadata without rewriting the transcript or resurrecting deleted sessions', async () => {
    const store = createLocalThreadStore(db as never);
    await store.save({ threadId: 'a', messages: [{ id: 'reply', role: 'assistant', content: 'complete reply' }], state: { done: true }, createdAt: 1, updatedAt: 2 });
    await store.rename('a', 'Custom title', 3);
    expect(await store.load('a')).toEqual({ threadId: 'a', messages: [{ id: 'reply', role: 'assistant', content: 'complete reply' }], state: { done: true }, createdAt: 1, updatedAt: 3, customTitle: 'Custom title' });
    await store.remove('a');
    await store.rename('a', 'Late rename', 4);
    expect(await store.load('a')).toBeNull();
    await expect(store.save({ threadId: 'a', messages: [], state: {}, createdAt: 1, updatedAt: 5 })).rejects.toThrow('已删除');
  });
  it('removes credentials recursively while preserving shared references', () => {
    const shared = { content: 'safe', apiKey: 'secret', nested: { authorization: 'Bearer secret', endpoint: 'https://example.invalid', value: 2 } };
    expect(sanitizePersistedValue([shared, shared])).toEqual(Array(2).fill({ content: 'safe', nested: { value: 2 } }));
  });
  it('round-trips messages and state through SQLite', async () => {
    const store = createLocalThreadStore(db as never);
    const snapshot = { threadId: 'thread-1', messages: [{ id: 'm1', role: 'user' as const, content: 'hello' }], state: { draft: 'prompt' }, createdAt: 10, updatedAt: 20, customTitle: '自定义标题' };
    await store.save({ ...snapshot, state: { ...snapshot.state, apiKey: 'must-not-persist' } });
    expect(await store.load(snapshot.threadId)).toEqual(snapshot);
  });
});
