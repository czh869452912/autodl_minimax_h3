import { createPromptDraftStore } from './promptDraft';

function memoryDatabase() {
  const rows = new Map<string, { id: string; prompt: string; attachment_ids_json: string; created_at: number }>();
  return {
    execSync: jest.fn(),
    runSync: jest.fn((sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT OR REPLACE')) {
        const [id, prompt, attachmentIdsJson, createdAt] = params;
        rows.set(String(id), { id: String(id), prompt: String(prompt), attachment_ids_json: String(attachmentIdsJson), created_at: Number(createdAt) });
      } else if (sql.includes('created_at <')) {
        for (const [id, row] of rows) if (row.created_at < Number(params[0])) rows.delete(id);
      } else if (sql.startsWith('DELETE')) {
        rows.delete(String(params[0]));
      }
    }),
    getFirstSync: jest.fn((_sql: string, id: unknown) => rows.get(String(id)) ?? null),
  };
}

describe('prompt draft store', () => {
  it('round trips and consumes a draft', async () => {
    const db = memoryDatabase();
    const store = createPromptDraftStore(db as never, () => 10_000);
    const saved = await store.save({ prompt: 'A crane shot.', attachmentIds: [] });
    await expect(store.read(saved.id)).resolves.toMatchObject({ prompt: 'A crane shot.' });
    await expect(store.consume(saved.id)).resolves.toMatchObject({ id: saved.id });
    await expect(store.read(saved.id)).resolves.toBeNull();
  });

  it('expires drafts older than one hour', async () => {
    const db = memoryDatabase();
    let now = 100_000;
    const store = createPromptDraftStore(db as never, () => now);
    const saved = await store.save({ prompt: 'Old.', attachmentIds: [] });
    now += 60 * 60 * 1000 + 1;
    await expect(store.read(saved.id)).resolves.toBeNull();
  });
});
