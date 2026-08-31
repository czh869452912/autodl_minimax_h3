import { createSqliteMediaStore } from './repository';
import type { MediaAsset } from './types';

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    execSync: () => undefined,
    runSync: (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT')) rows.set(String(params[0]), { id: params[0], task_id: params[1], title: params[2], prompt: params[3], source_url: params[4], local_path: params[5], poster_path: params[6], mime_type: params[7], width: params[8], height: params[9], duration_ms: params[10], status: params[11], created_at: params[12], updated_at: params[13] });
      if (sql.startsWith('DELETE')) rows.delete(String(params[0]));
    },
    getAllSync: <T>(sql: string, ...params: unknown[]) => (sql.includes('WHERE id')
      ? (rows.has(String(params[0])) ? [rows.get(String(params[0])) as T] : [])
      : [...rows.values()] as T[]),
  };
}

const asset: MediaAsset = { id: 'm1', taskId: 't1', title: 'Demo', prompt: 'prompt', sourceUrl: 'https://example/video.mp4', mimeType: 'video/mp4', status: 'downloaded', createdAt: 2, updatedAt: 2 };

test('upserts and lists media assets', async () => {
  const store = createSqliteMediaStore(fakeDb());
  await store.upsert(asset);
  expect((await store.list())[0].id).toBe('m1');
  expect((await store.get('m1'))?.sourceUrl).toContain('video.mp4');
});

test('removes media assets', async () => {
  const store = createSqliteMediaStore(fakeDb());
  await store.upsert(asset);
  await store.remove('m1');
  expect(await store.get('m1')).toBeNull();
});

test('supports bounded media pages', async () => {
  const store = createSqliteMediaStore(fakeDb());
  await store.upsert(asset);
  const page = await store.listPage?.({ limit: 1 });
  expect(page).toMatchObject({ items: [expect.objectContaining({ id: 'm1' })] });
});
