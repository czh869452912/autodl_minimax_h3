import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createTaskProjectionRepository, ProjectionChangedDuringRead } from './projectionRepository';

type RealDb = ReturnType<typeof createInitializedRealSqliteTestDb>;

function insertTask(db: RealDb, index: number, patch: Record<string, unknown> = {}) {
  db.runSync(
    `INSERT INTO tasks (
      id,prompt,status,resolution,duration,images_json,audios_json,input_json,
      video_url,local_uri,thumbnail_url,download_state,download_error,download_progress,
      gallery_uri,export_state,export_error,created_at,updated_at,started_at,
      execution_duration,sync_error,last_sync_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    `task-${String(index).padStart(4, '0')}`, `prompt ${index}`, patch.status ?? 'SUCCESS', '768p竖', 5,
    patch.imagesJson ?? '{'.repeat(12_000), patch.audiosJson ?? '['.repeat(12_000), patch.inputJson ?? 'not-json'.repeat(2_000),
    patch.videoUrl ?? null, patch.localUri ?? null, patch.thumbnailUrl ?? null, patch.downloadState ?? 'IDLE',
    patch.downloadError ?? null, patch.downloadProgress ?? null, patch.galleryUri ?? null,
    patch.exportState ?? 'NOT_REQUESTED', patch.exportError ?? null, index, index,
    patch.startedAt ?? null, patch.executionDuration ?? null, patch.syncError ?? null, patch.lastSyncAt ?? null,
  );
}

function insertOperation(db: RealDb, values: {
  id: string; state: 'PENDING' | 'CLAIMED'; nextRetryAt: number; leaseExpiresAt?: number;
}) {
  db.runSync(
    `INSERT INTO workflow_operations (
      id,kind,idempotency_key,payload_json,state,attempt,next_retry_at,lease_expires_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    values.id, 'STATUS_SYNC', values.id, '{}', values.state, 0, values.nextRetryAt,
    values.leaseExpiresAt ?? null, 1, 1,
  );
}

test('loads the first 40 task cards without selecting persisted input or attachment JSON', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    for (let index = 0; index < 1_000; index += 1) insertTask(db, index);
    const getAllAsync = db.getAllAsync.bind(db);
    const guardedDb = {
      ...db,
      async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
        if (sql.includes('FROM tasks') && /input_json|images_json|audios_json/.test(sql)) {
          throw new Error('task card query selected an undisplayed JSON column');
        }
        return getAllAsync<T>(sql, ...params);
      },
    };

    const window = await createTaskProjectionRepository(guardedDb as never).readWindow(40);

    expect(window.items).toHaveLength(40);
    expect(window.items[0]).toMatchObject({ id: 'task-0999', prompt: 'prompt 999', status: 'SUCCESS' });
    expect(window.items[0]).not.toHaveProperty('inputSnapshot');
    expect(window.nextCursor).toEqual({ createdAt: 960, id: 'task-0960' });
  } finally { db.close(); }
});

test('uses a stable keyset cursor and bounds a task-card window to 120 rows', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    for (let index = 0; index < 150; index += 1) insertTask(db, index, { imagesJson: '{', audiosJson: '[', inputJson: '{' });
    const repository = createTaskProjectionRepository(db as never);

    const capped = await repository.readWindow(999);
    const next = await repository.readWindow(40, capped.nextCursor);

    expect(capped.items).toHaveLength(120);
    expect(capped.items.at(-1)).toMatchObject({ id: 'task-0030' });
    expect(next.items.map((item) => item.id)).toEqual([
      'task-0029', 'task-0028', 'task-0027', 'task-0026', 'task-0025', 'task-0024', 'task-0023', 'task-0022', 'task-0021', 'task-0020',
      'task-0019', 'task-0018', 'task-0017', 'task-0016', 'task-0015', 'task-0014', 'task-0013', 'task-0012', 'task-0011', 'task-0010',
      'task-0009', 'task-0008', 'task-0007', 'task-0006', 'task-0005', 'task-0004', 'task-0003', 'task-0002', 'task-0001', 'task-0000',
    ]);
  } finally { db.close(); }
});

test('summarizes active tasks and pending or claimed work outside the visible page', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    for (let index = 0; index < 80; index += 1) insertTask(db, index, { imagesJson: '{', audiosJson: '[', inputJson: '{' });
    insertTask(db, 900, { status: 'RUNNING' });
    insertTask(db, 901, { downloadState: 'DOWNLOADING', downloadProgress: 0.5 });
    insertTask(db, 902, { exportState: 'EXPORTING' });
    insertOperation(db, { id: 'due', state: 'PENDING', nextRetryAt: 900 });
    insertOperation(db, { id: 'scheduled', state: 'PENDING', nextRetryAt: 1_200 });
    insertOperation(db, { id: 'leased', state: 'PENDING', nextRetryAt: 800, leaseExpiresAt: 1_100 });
    insertOperation(db, { id: 'claimed', state: 'CLAIMED', nextRetryAt: 800, leaseExpiresAt: 1_050 });

    const activity = await createTaskProjectionRepository(db as never).readActivity(1_000);

    expect(activity).toEqual({
      activeTaskCount: 3,
      pendingOperationCount: 3,
      claimedOperationCount: 1,
      remainingDue: 1,
      remainingScheduled: 3,
      nextWakeAt: 1_050,
    });
  } finally { db.close(); }
});

test('retries instead of publishing activity changed by an operation write between revision fences', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    insertTask(db, 1, { imagesJson: '{', audiosJson: '[', inputJson: '{' });
    insertOperation(db, { id: 'scheduled', state: 'PENDING', nextRetryAt: Number.MAX_SAFE_INTEGER });
    let activityReads = 0;
    const getFirstAsync = db.getFirstAsync.bind(db);
    const racingDb = {
      ...db,
      async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
        const isActivityRead = sql.includes('active_task_count');
        const row = await getFirstAsync<T>(sql, ...params);
        activityReads += Number(isActivityRead);
        if (isActivityRead && activityReads === 1) {
          db.runSync("UPDATE workflow_operations SET next_retry_at=0 WHERE id='scheduled'");
        }
        return row;
      },
    };

    const result = await createTaskProjectionRepository(racingDb as never).readConsistentWindow(40);

    expect(result).not.toBeInstanceOf(ProjectionChangedDuringRead);
    if (result instanceof ProjectionChangedDuringRead) throw result;
    expect(result.activity).toMatchObject({ remainingDue: 1, remainingScheduled: 0 });
  } finally { db.close(); }
});

test('returns a revision-fenced page after retrying a projection change between fences', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    insertTask(db, 1, { imagesJson: '{', audiosJson: '[', inputJson: '{' });
    let activityReads = 0;
    const getFirstAsync = db.getFirstAsync.bind(db);
    const racingDb = {
      ...db,
      async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
        const isActivityRead = sql.includes('active_task_count');
        const row = await getFirstAsync<T>(sql, ...params);
        activityReads += Number(isActivityRead);
        if (isActivityRead && activityReads === 1) db.runSync("UPDATE tasks SET prompt='changed' WHERE id='task-0001'");
        return row;
      },
    };
    const repository = createTaskProjectionRepository(racingDb as never);

    expect(await repository.readRevision()).toBe(1);
    const result = await repository.readConsistentWindow(40);

    expect(result).not.toBeInstanceOf(ProjectionChangedDuringRead);
    if (result instanceof ProjectionChangedDuringRead) throw result;
    expect(result.revision).toBe(2);
    expect(result.items).toMatchObject([{ id: 'task-0001', prompt: 'changed' }]);
  } finally { db.close(); }
});

test('returns a typed conflict after the revision changes during both fenced attempts', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    insertTask(db, 1, { imagesJson: '{', audiosJson: '[', inputJson: '{' });
    let activityReads = 0;
    const getFirstAsync = db.getFirstAsync.bind(db);
    const racingDb = {
      ...db,
      async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
        const isActivityRead = sql.includes('active_task_count');
        const row = await getFirstAsync<T>(sql, ...params);
        activityReads += Number(isActivityRead);
        if (isActivityRead) db.runSync('UPDATE tasks SET updated_at=updated_at+1 WHERE id=?', 'task-0001');
        return row;
      },
    };

    const result = await createTaskProjectionRepository(racingDb as never).readConsistentWindow(40);

    expect(result).toBeInstanceOf(ProjectionChangedDuringRead);
    expect(result).toMatchObject({ attempts: 2 });
  } finally { db.close(); }
});
