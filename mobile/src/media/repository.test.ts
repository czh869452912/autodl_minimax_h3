import { createSqliteMediaStore } from './repository';
import type { MediaAsset } from './types';

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    execSync: () => undefined,
    runSync: (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT') && sql.includes('media_assets')) rows.set(String(params[0]), { id: params[0], task_id: params[1], title: params[2], prompt: params[3], source_url: params[4], local_path: params[5], poster_path: params[6], mime_type: params[7], width: params[8], height: params[9], duration_ms: params[10], status: params[11], created_at: params[12], updated_at: params[13], artifact_id: params[14], job_id: params[15], workflow_id: params[16], kind: params[17] });
      if (sql.startsWith('DELETE')) rows.delete(String(params[0]));
    },
    getAllSync: <T>(sql: string, ...params: unknown[]) => (sql.includes('WHERE id')
      ? (rows.has(String(params[0])) ? [rows.get(String(params[0])) as T] : [])
      : [...rows.values()] as T[]),
  };
}

function strictQueryDb() {
  const row = { id: 'm1', task_id: 't1', title: 'Demo', prompt: 'prompt', source_url: 'https://example/video.mp4', local_path: null, poster_path: null, mime_type: 'video/mp4', status: 'downloaded', created_at: 2, updated_at: 2, kind: 'video' };
  return {
    execSync: () => undefined,
    getAllSync: <T>(sql: string, ...params: unknown[]) => {
      // The listPage query must treat an empty search as no filter. If it
      // binds an empty string, SQLite's LIKE predicates receive NULL and
      // incorrectly exclude every row.
      if (sql.includes('FROM media_assets') && params[4] === '') return [] as T[];
      return [row as T];
    },
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

test('treats an empty search query as no filter', async () => {
  const store = createSqliteMediaStore(strictQueryDb());
  const page = await store.listPage?.({ limit: 40, query: '   ' });
  expect(page?.items).toHaveLength(1);
});

test('round-trips workflow artifact provenance independently from task state', async () => {
  const store = createSqliteMediaStore(fakeDb());
  await store.upsert({ ...asset, id: 'job-1:artifact-1', artifactId: 'artifact-1', jobId: 'job-1', workflowId: 'workflow-1', kind: 'audio', mimeType: 'audio/mpeg' });
  expect(await store.get('job-1:artifact-1')).toMatchObject({ artifactId: 'artifact-1', jobId: 'job-1', workflowId: 'workflow-1', kind: 'audio' });
});
