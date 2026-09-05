import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createTaskRepository } from '../tasks/repository';
import { reconcileMediaState } from './reconciliation';

async function seedCompletedTask(db: ReturnType<typeof createInitializedRealSqliteTestDb>, id: string): Promise<void> {
  await createTaskRepository(db as never).upsert({
    id, prompt: 'repair me', status: 'SUCCESS', resolution: '768p竖', duration: 5,
    videoUrl: `https://cdn.test/${id}.mp4`, createdAt: 1, updatedAt: 2,
  });
  db.runSync(
    "INSERT INTO workflow_jobs (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES (?,0,'h3','1','hash','demo','1','{}','SUCCEEDED',1,2)",
    id,
  );
}

const deps = (db: ReturnType<typeof createInitializedRealSqliteTestDb>, fileExists = async () => true) => ({
  db: db as never,
  fileExists: jest.fn(fileExists),
  removeCasPath: jest.fn(async () => undefined),
  now: () => 100,
});

test('bounded maintenance uses asynchronous database calls throughout repair and garbage collection', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    await seedCompletedTask(db, 'async-job');
    const asyncOnly = { ...db,
      getFirstSync: () => { throw new Error('sync read'); }, getAllSync: () => { throw new Error('sync scan'); },
      runSync: () => { throw new Error('sync write'); }, execSync: () => { throw new Error('sync exec'); },
    };
    expect((await reconcileMediaState(deps(asyncOnly as never))).scanned).toBe(1);
  } finally { db.close(); }
});

test('materializes an artifact that has no media asset idempotently', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    await seedCompletedTask(db, 'job-1');
    db.runSync("INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime) VALUES ('video-1','job-1','video','https://cdn.test/video.mp4','video/mp4')");
    const options = deps(db);
    expect((await reconcileMediaState({ ...options, limit: 8 })).repaired).toBe(1);
    expect((await reconcileMediaState({ ...options, limit: 8 })).repaired).toBe(0);
    expect(db.getFirstSync("SELECT id FROM media_assets WHERE id='job-1:video-1'")).toEqual({ id: 'job-1:video-1' });
  } finally { db.close(); }
});

test('recovers a valid artifact from a succeeded download operation idempotently', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    await seedCompletedTask(db, 'job-1');
    const artifact = { id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn.test/video.mp4', mime: 'video/mp4' };
    db.runSync("INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES ('download-1','ARTIFACT_DOWNLOAD','job-1','artifact:job-1:video-1',?,'SUCCEEDED',1,1,1,2)", JSON.stringify({ artifact }));
    const options = deps(db);
    expect((await reconcileMediaState(options)).repaired).toBe(1);
    expect((await reconcileMediaState(options)).repaired).toBe(0);
    expect(db.getFirstSync("SELECT id FROM workflow_artifacts WHERE job_id='job-1'")).toEqual({ id: 'video-1' });
    expect(db.getFirstSync("SELECT id FROM media_assets WHERE task_id='job-1'")).toEqual({ id: 'job-1:video-1' });
  } finally { db.close(); }
});

test('recovers a private task video and an exported delivery idempotently', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    await seedCompletedTask(db, 'job-1');
    db.runSync("UPDATE tasks SET local_uri='file:///cas/video',download_state='DOWNLOADED',gallery_uri='content://media/7',export_state='EXPORTED' WHERE id='job-1'");
    const options = deps(db);
    expect((await reconcileMediaState(options)).repaired).toBe(1);
    expect((await reconcileMediaState(options)).repaired).toBe(0);
    expect(db.getFirstSync("SELECT local_path,status FROM media_assets WHERE task_id='job-1'")).toEqual({ local_path: 'file:///cas/video', status: 'downloaded' });
    expect(db.getFirstSync("SELECT uri,status FROM media_deliveries WHERE target='system-gallery'")).toEqual({ uri: 'content://media/7', status: 'EXPORTED' });
  } finally { db.close(); }
});

test('clears stale local projections while preserving a remote recovery path', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    await seedCompletedTask(db, 'job-1');
    db.runSync("UPDATE tasks SET local_uri='file:///missing.mp4',download_state='DOWNLOADED' WHERE id='job-1'");
    db.runSync("INSERT INTO media_assets (id,task_id,title,prompt,source_url,local_path,mime_type,status,created_at,updated_at,kind) VALUES ('asset-1','job-1','x','x','https://cdn.test/video.mp4','file:///missing.mp4','video/mp4','downloaded',1,2,'video')");
    const options = deps(db, async () => false);
    expect((await reconcileMediaState(options)).staleFiles).toBe(1);
    expect((await reconcileMediaState(options)).repaired).toBe(0);
    expect(db.getFirstSync("SELECT local_uri,download_state FROM tasks WHERE id='job-1'")).toEqual({ local_uri: null, download_state: 'IDLE' });
    expect(db.getFirstSync("SELECT local_path,status FROM media_assets WHERE id='asset-1'")).toEqual({ local_path: null, status: 'queued' });
  } finally { db.close(); }
});

test('never scans more than the supplied limit', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    for (let index = 0; index < 20; index += 1) {
      const id = `job-${index}`;
      await seedCompletedTask(db, id);
      db.runSync('INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime) VALUES (?,?,?,?,?)', 'video-1', id, 'video', `https://cdn.test/${id}.mp4`, 'video/mp4');
    }
    await expect(reconcileMediaState({ ...deps(db), limit: 4 })).resolves.toMatchObject({ scanned: 4 });
  } finally { db.close(); }
});

test('advances a persisted cursor so healthy old tasks cannot starve later repairs', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    for (let index = 0; index < 6; index += 1) {
      const id = `job-${index}`;
      await seedCompletedTask(db, id);
      db.runSync('UPDATE tasks SET updated_at=? WHERE id=?', index + 1, id);
      db.runSync(
        "INSERT INTO media_assets (id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,kind) VALUES (?,?,?,?,?,'video/mp4','queued',1,?,'video')",
        `${id}:video`, id, id, id, `https://cdn.test/${id}.mp4`, index + 1,
      );
    }
    const options = { ...deps(db), limit: 3 };
    await expect(reconcileMediaState(options)).resolves.toMatchObject({ scanned: 3 });
    db.runSync("DELETE FROM media_assets WHERE task_id='job-4'");
    await expect(reconcileMediaState(options)).resolves.toMatchObject({ scanned: 3, repaired: 1 });
    expect(db.getFirstSync("SELECT id FROM media_assets WHERE task_id='job-4'")).toBeTruthy();
  } finally { db.close(); }
});
