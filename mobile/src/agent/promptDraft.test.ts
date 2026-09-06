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

  it('retains the full handoff on repeated reads until explicitly consumed', async () => {
    const db = memoryDatabase();
    const store = createPromptDraftStore(db as never, () => 10_000);
    const handoff = { prompt: 'Orbit the tower', images: [{ id: 'i1', displayName: 'Tower', filename: 'tower.png', uri: 'data:image/png;base64,aGVsbG8=' }], parameters: { resolution: '480p横', durationSeconds: 8, seed: '123' }, source: { threadId: 't1', messageId: 'm1', versionId: 'v2' } };
    const saved = await store.save({ prompt: handoff.prompt, attachmentIds: ['i1'], handoff });
    expect(await store.read(saved.id)).toEqual({ ...saved, handoff });
    expect(await store.read(saved.id)).toEqual({ ...saved, handoff });
    await store.consume(saved.id);
    expect(await store.read(saved.id)).toBeNull();
  });

  it('reads legacy arrays but rejects malformed handoffs without deleting them', async () => {
    const db = memoryDatabase();
    const store = createPromptDraftStore(db as never, () => 10_000);
    db.runSync('INSERT OR REPLACE', 'legacy', 'old prompt', '["image1",12]', 10_000);
    expect(await store.read('legacy')).toMatchObject({ attachmentIds: ['image1'] });
    db.runSync('INSERT OR REPLACE', 'broken', 'new prompt', JSON.stringify({ version: 1, attachmentIds: [], handoff: { prompt: 'new prompt' } }), 10_000);
    await expect(store.read('broken')).rejects.toThrow('交接');
    expect(db.getFirstSync('', 'broken')).not.toBeNull();
    db.runSync('INSERT OR REPLACE', 'corrupt', 'new prompt', '{"version":1', 10_000);
    await expect(store.read('corrupt')).rejects.toThrow('交接');
    expect(db.getFirstSync('', 'corrupt')).not.toBeNull();
  });
});
