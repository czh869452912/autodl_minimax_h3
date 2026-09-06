import type { Message } from '@ag-ui/client';
import { createLocalThreadStore, sanitizePersistedValue } from './threadStore';

function memoryDatabase() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    execSync: jest.fn((sql: string) => sql.includes('CREATE TABLE') ? undefined : undefined),
    runSync: jest.fn((sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT OR REPLACE')) {
        const [threadId, messagesJson, stateJson, createdAt, updatedAt, customTitle] = params;
        rows.set(String(threadId), {
          thread_id: threadId,
          messages_json: messagesJson,
          state_json: stateJson,
          created_at: createdAt,
          updated_at: updatedAt,
          custom_title: customTitle,
        });
      } else if (sql.startsWith('DELETE')) {
        rows.delete(String(params[0]));
      }
    }),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT OR REPLACE')) {
        const [threadId, messagesJson, stateJson, createdAt, updatedAt, customTitle] = params;
        rows.set(String(threadId), {
          thread_id: threadId,
          messages_json: messagesJson,
          state_json: stateJson,
          created_at: createdAt,
          updated_at: updatedAt,
          custom_title: customTitle,
        });
      } else if (sql.startsWith('UPDATE agent_threads SET custom_title')) {
        const [title, updatedAt, threadId] = params;
        const current = rows.get(String(threadId));
        if (current) rows.set(String(threadId), {
          ...current,
          custom_title: title,
          updated_at: sql.includes('MAX(updated_at, ?)') ? Math.max(Number(current.updated_at), Number(updatedAt)) : updatedAt,
        });
      } else if (sql.startsWith('DELETE')) {
        rows.delete(String(params[0]));
      }
    }),
    getFirstSync: jest.fn((_sql: string, threadId: unknown) => rows.get(String(threadId)) ?? null),
    getAllSync: jest.fn(() => [...rows.values()].sort((a, b) => Number(b.updated_at) - Number(a.updated_at))),
    getFirstAsync: jest.fn(async (_sql: string, threadId: unknown) => rows.get(String(threadId)) ?? null),
    getAllAsync: jest.fn(async () => [...rows.values()].sort((a, b) => Number(b.updated_at) - Number(a.updated_at))),
  };
}

describe('local agent thread store', () => {
  it('keeps later stream activity when an earlier rename timestamp is persisted afterward', async () => {
    const store = createLocalThreadStore(memoryDatabase() as never);
    await store.save({ threadId: 'a', messages: [], state: {}, createdAt: 1, updatedAt: 40 });
    await store.rename('a', 'Renamed', 30);
    expect(await store.load('a')).toMatchObject({ customTitle: 'Renamed', updatedAt: 40 });
  });

  it('renames only metadata without rewriting a newer transcript or inserting deleted sessions', async () => {
    const store = createLocalThreadStore(memoryDatabase() as never);
    await store.save({ threadId: 'a', messages: [{ id: 'reply', role: 'assistant', content: 'complete reply' }], state: { done: true }, createdAt: 1, updatedAt: 2 });
    await store.rename('a', 'Custom title', 3);
    expect(await store.load('a')).toEqual({ threadId: 'a', messages: [{ id: 'reply', role: 'assistant', content: 'complete reply' }], state: { done: true }, createdAt: 1, updatedAt: 3, customTitle: 'Custom title' });
    await store.remove('a');
    await store.rename('a', 'Late rename', 4);
    expect(await store.load('a')).toBeNull();
  });

  it('removes credentials and transport metadata recursively', () => {
    expect(sanitizePersistedValue({
      content: 'safe',
      apiKey: 'secret',
      nested: { authorization: 'Bearer secret', endpoint: 'https://example.invalid', value: 2 },
    })).toEqual({ content: 'safe', nested: { value: 2 } });
  });

  it('round-trips CopilotKit messages and agent state through SQLite', async () => {
    const db = memoryDatabase();
    const store = createLocalThreadStore(db as never);
    const messages = [{ id: 'm1', role: 'user', content: 'hello' }] as Message[];

    await store.save({
      threadId: 'thread-1',
      messages,
      state: { draft: 'prompt', apiKey: 'must-not-persist' },
      createdAt: 10,
      updatedAt: 20,
      customTitle: '自定义标题',
    });

    expect(await store.load('thread-1')).toEqual({
      threadId: 'thread-1',
      messages,
      state: { draft: 'prompt' },
      createdAt: 10,
      updatedAt: 20,
      customTitle: '自定义标题',
    });
    expect(db.execSync).not.toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalled();
    expect(db.runSync).not.toHaveBeenCalled();
  });
});
