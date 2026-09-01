import { createTaskRepository } from './repository';
import type { TaskRecord } from './types';

function fakeDb() {
  let row: Record<string, unknown> | undefined;
  return {
    execSync: () => undefined,
    runSync: (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT')) row = {
        id: params[0], prompt: params[1], status: params[2], resolution: params[3], duration: params[4],
        seed: params[5], images_json: params[6], audios_json: params[7], video_url: params[8], local_uri: params[9],
        thumbnail_url: params[10], download_state: params[11], download_error: params[12], download_progress: params[13],
        gallery_uri: params[14], export_state: params[15], export_error: params[16], exported_at: params[17],
        created_at: params[18], updated_at: params[19], started_at: params[20], execution_duration: params[21],
        workflow_id: params[22], workflow_version: params[23], workflow_hash: params[24], adapter_id: params[25],
        adapter_version: params[26], input_json: params[27], sync_error: params[28], last_sync_at: params[29],
      };
    },
    getAllSync: <T>() => row ? [row as T] : [],
  };
}

function queryDb() {
  const row = { id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5, created_at: 1, updated_at: 1 };
  return {
    execSync: () => undefined,
    getAllSync: <T>(_sql: string, ...params: unknown[]) => params[2] === '' ? [] as T[] : [row as T],
  };
}

test('persists provider start time and execution duration', async () => {
  const store = createTaskRepository(fakeDb() as never);
  const task: TaskRecord = {
    id: 'task-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5,
    createdAt: 1_000, updatedAt: 2_000, startedAt: 1_500, executionDuration: 42,
  };
  await store.upsert(task);
  expect((await store.list())[0]).toMatchObject({ startedAt: 1_500, executionDuration: 42 });
});

test('persists gallery publication independently from private download', async () => {
  const store = createTaskRepository(fakeDb() as never);
  const task: TaskRecord = {
    id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    localUri: 'file:///private.mp4', galleryUri: 'content://media/video/7',
    downloadState: 'DOWNLOADED', exportState: 'EXPORTED', exportedAt: 3_000,
    createdAt: 1_000, updatedAt: 3_000,
  };
  await store.upsert(task);
  expect((await store.list())[0]).toMatchObject({
    localUri: 'file:///private.mp4',
    galleryUri: 'content://media/video/7',
    downloadState: 'DOWNLOADED',
    exportState: 'EXPORTED',
    exportedAt: 3_000,
  });
});

test('round-trips workflow provenance and keeps it across partial updates', async () => {
  const store = createTaskRepository(fakeDb() as never);
  const task: TaskRecord = {
    id: 'job-local-1', prompt: 'x', status: 'RUNNING', resolution: '768p竖', duration: 5,
    workflowId: 'autodl.minimax-h3.i2v-15s', workflowVersion: '1.0.0', workflowContentHash: 'hash',
    adapterId: 'autodl-comfyui', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x', duration: 5 },
    videoUrl: 'https://cdn.example/video.mp4', createdAt: 1_000, updatedAt: 2_000,
  };
  await store.upsert(task);
  expect(await store.list()).toEqual([expect.objectContaining({
    workflowId: task.workflowId, workflowVersion: task.workflowVersion,
    workflowContentHash: task.workflowContentHash, adapterId: task.adapterId,
    adapterVersion: task.adapterVersion, inputSnapshot: task.inputSnapshot,
  })]);

  await store.upsert({ ...task, status: 'SUCCESS', updatedAt: 3_000 });
  expect(await store.list()).toEqual([expect.objectContaining({
    status: 'SUCCESS', videoUrl: task.videoUrl, workflowId: task.workflowId,
    workflowVersion: task.workflowVersion, inputSnapshot: task.inputSnapshot,
  })]);
});

test('exposes stable keyset pagination and watermark queries', async () => {
  const store = createTaskRepository(fakeDb() as never);
  expect(store.listPage).toBeDefined();
  expect(store.listUpdatedSince).toBeDefined();
  const page = await store.listPage?.({ limit: 20 });
  expect(page).toMatchObject({ items: expect.any(Array) });
  expect(page).toHaveProperty('nextCursor');
  expect(await store.listUpdatedSince?.(1_500)).toEqual(expect.any(Array));
});

test('loads one task by id without scanning the full task table', async () => {
  const calls: string[] = [];
  const row = { id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5, created_at: 1, updated_at: 1 };
  const db = {
    execSync: () => undefined,
    getFirstSync: <T>(sql: string) => { calls.push(sql); return row as T; },
    getAllSync: <T>() => [] as T[],
  };
  const store = createTaskRepository(db as never) as ReturnType<typeof createTaskRepository> & { get?: (id: string) => Promise<TaskRecord | undefined> };
  expect(store.get).toBeDefined();
  await expect(store.get?.('task-1')).resolves.toMatchObject({ id: 'task-1' });
  expect(calls.some((sql) => sql.includes('WHERE id = ?'))).toBe(true);
});

test('treats an empty task query as no filter', async () => {
  const store = createTaskRepository(queryDb() as never);
  const page = await store.listPage({ limit: 20, query: '   ' });
  expect(page.items).toHaveLength(1);
});

test('exposes synchronization candidates for one-time repair of incomplete completed tasks', () => {
  const store = createTaskRepository(fakeDb() as never) as ReturnType<typeof createTaskRepository> & { listSyncCandidates?: () => Promise<TaskRecord[]> };
  expect(store.listSyncCandidates).toBeDefined();
});

test('finds bounded completed tasks missing from the app media catalog', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = fakeDb();
  const original = db.getAllSync;
  db.getAllSync = (<T>(sql: string, ...params: unknown[]) => {
    calls.push({ sql, params });
    return original<T>();
  }) as typeof db.getAllSync;
  const store = createTaskRepository(db as never) as ReturnType<typeof createTaskRepository> & { listMediaProjectionCandidates?: (limit?: number) => Promise<TaskRecord[]> };

  await store.listMediaProjectionCandidates?.(50);

  expect(calls.at(-1)?.sql).toContain('NOT EXISTS (SELECT 1 FROM media_assets');
  expect(calls.at(-1)?.params).toEqual([50]);
});

test('ignores malformed persisted task JSON instead of crashing', async () => {
  const db = {
    execSync: jest.fn(),
    getFirstSync: jest.fn((sql: string) => sql.includes('PRAGMA') ? { user_version: 3 } : null),
    getAllSync: jest.fn((sql: string) => sql.includes('PRAGMA') ? [] : [{ id: 'bad', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5, input_json: '{', images_json: '{', audios_json: '{', created_at: 1, updated_at: 1 }]),
    runSync: jest.fn(),
  };
  const store = createTaskRepository(db as never);
  await expect(store.list()).resolves.toMatchObject([{ id: 'bad', inputSnapshot: undefined, images: undefined, audios: undefined }]);
});
