import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createMediaCommandService } from './mediaCommandService';

function seed(db: ReturnType<typeof createInitializedRealSqliteTestDb>, options: { localUri?: string } = {}) {
  db.runSync(
    "INSERT INTO tasks (id,prompt,status,resolution,duration,video_url,local_uri,download_state,export_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    'job-1', 'result', 'SUCCESS', '768p竖', 5, 'https://cdn.example/video.mp4', options.localUri ?? null,
    options.localUri ? 'DOWNLOADED' : 'DOWNLOAD_FAILED', 'NOT_REQUESTED', 1, 2,
  );
  db.runSync(
    "INSERT INTO workflow_jobs (id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    'job-1', 'demo', '1', 'hash', 'demo', '1', '{}', 'SUCCEEDED', 1, 2, 1,
  );
  db.runSync(
    'INSERT INTO workflow_artifacts (id,job_id,kind,uri,mime,metadata_json) VALUES (?,?,?,?,?,?)',
    'video-1', 'job-1', 'video', 'https://cdn.example/video.mp4', 'video/mp4', '{}',
  );
  db.runSync(
    "INSERT INTO media_assets (id,task_id,title,prompt,source_url,local_path,mime_type,status,created_at,updated_at,artifact_id,job_id,workflow_id,kind,export_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    'job-1:video-1', 'job-1', 'result', 'result', 'https://cdn.example/video.mp4', options.localUri ?? null,
    'video/mp4', options.localUri ? 'downloaded' : 'failed', 1, 2, 'video-1', 'job-1', 'demo', 'video', 'NOT_REQUESTED',
  );
}

function service(db: ReturnType<typeof createInitializedRealSqliteTestDb>, existing: Set<string>) {
  return createMediaCommandService({
    db: db as never,
    fileExists: async (uri) => existing.has(uri),
    resolveCasUri: (relativePath) => `file:///documents/${relativePath}`,
    now: () => 100,
  });
}

test('returns already complete only for an existing CAS blob and workflow reference', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const uri = `file:///documents/cas/sha256/aa/${'a'.repeat(64)}`;
    seed(db, { localUri: uri });
    db.runSync('INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?)',
      'a'.repeat(64), 3, 'video/mp4', `cas/sha256/aa/${'a'.repeat(64)}`, 1, 1);
    db.runSync('INSERT INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)',
      'a'.repeat(64), 'workflow_artifact', 'job-1:video-1', 1);
    await expect(service(db, new Set([uri])).requestDownload('job-1')).resolves.toEqual({ status: 'already-complete' });
    expect(db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(0);
  } finally { db.close(); }
});

test('appends one manual generation after terminal download and reuses it while in flight', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    seed(db);
    db.runSync("INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,'SUCCEEDED',1,1,1,1)",
      'job-1:artifact:video-1', 'ARTIFACT_DOWNLOAD', 'job-1', 'artifact:job-1:video-1', JSON.stringify({ artifact: { id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn.example/video.mp4', mime: 'video/mp4' } }));
    const commands = service(db, new Set());
    const first = await commands.requestDownload('job-1');
    const second = await commands.requestDownload('job-1');
    expect(first).toMatchObject({ status: 'queued', operation: { idempotencyKey: 'artifact:job-1:video-1:manual:1' } });
    expect(second).toMatchObject({ status: 'in-flight', operation: { id: first.operation?.id } });
    expect(db.getAllSync("SELECT * FROM workflow_operations WHERE state='PENDING'")).toHaveLength(1);
    expect(db.getFirstSync('SELECT download_state,download_progress FROM tasks WHERE id=?', 'job-1')).toEqual({ download_state: 'ENQUEUED', download_progress: 0 });
  } finally { db.close(); }
});

test('queues a CAS export with frozen policy and deterministic delivery projection', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    const uri = `file:///documents/cas/sha256/aa/${'a'.repeat(64)}`;
    seed(db, { localUri: uri });
    db.runSync('INSERT INTO artifact_blobs (sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES (?,?,?,?,?,?)',
      'a'.repeat(64), 3, 'video/mp4', `cas/sha256/aa/${'a'.repeat(64)}`, 1, 1);
    db.runSync('INSERT INTO artifact_blob_refs (blob_sha256,owner_type,owner_id,created_at) VALUES (?,?,?,?)',
      'a'.repeat(64), 'workflow_artifact', 'job-1:video-1', 1);
    const result = await service(db, new Set([uri])).requestExport('job-1', { keepPrivateCopy: false });
    expect(result).toMatchObject({ status: 'queued', operation: { kind: 'EXPORT', payload: {
      sourceKind: 'cas', sourceUri: uri, blobSha256: 'a'.repeat(64), keepPrivateCopy: false,
    } } });
    expect(db.getFirstSync('SELECT status FROM media_deliveries WHERE id=?', 'job-1:video-1:system-gallery')).toEqual({ status: 'QUEUED' });
  } finally { db.close(); }
});

test('queues legacy export without a blob hash and chains missing private media through download intent', async () => {
  const legacyDb = createInitializedRealSqliteTestDb();
  try {
    seed(legacyDb, { localUri: 'file:///legacy/video.mp4' });
    await expect(service(legacyDb, new Set(['file:///legacy/video.mp4'])).requestExport('job-1', { keepPrivateCopy: true }))
      .resolves.toMatchObject({ status: 'queued', operation: { payload: { sourceKind: 'legacy', keepPrivateCopy: true } } });
  } finally { legacyDb.close(); }

  const missingDb = createInitializedRealSqliteTestDb();
  try {
    seed(missingDb);
    await expect(service(missingDb, new Set()).requestExport('job-1', { keepPrivateCopy: false }))
      .resolves.toMatchObject({ status: 'queued', operation: { kind: 'ARTIFACT_DOWNLOAD', payload: {
        deliveryIntent: { target: 'system-gallery', keepPrivateCopy: false },
      } } });
  } finally { missingDb.close(); }
});

test('persists delivery intent and queued delivery when save joins an active download', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    seed(db);
    db.runSync("INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,'PENDING',0,1,1,1)",
      'job-1:artifact:video-1', 'ARTIFACT_DOWNLOAD', 'job-1', 'artifact:job-1:video-1', JSON.stringify({ artifact: { id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn.example/video.mp4' } }));
    const result = await service(db, new Set()).requestExport('job-1', { keepPrivateCopy: false });
    expect(result).toMatchObject({ status: 'in-flight', operation: { payload: {
      deliveryIntent: { target: 'system-gallery', keepPrivateCopy: false },
    } } });
    expect(db.getFirstSync('SELECT export_state FROM tasks WHERE id=?', 'job-1')).toEqual({ export_state: 'QUEUED' });
    expect(db.getFirstSync('SELECT status FROM media_deliveries WHERE id=?', 'job-1:video-1:system-gallery')).toEqual({ status: 'QUEUED' });
  } finally { db.close(); }
});

test('allocates the next retry generation without reopening terminal audit rows', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    seed(db);
    for (const [suffix, state] of [['', 'SUCCEEDED'], [':manual:1', 'FAILED']] as const) {
      db.runSync("INSERT INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1,1,1)",
        `job-1:artifact:video-1${suffix}`, 'ARTIFACT_DOWNLOAD', 'job-1', `artifact:job-1:video-1${suffix}`,
        JSON.stringify({ artifact: { id: 'video-1', jobId: 'job-1', kind: 'video', uri: 'https://cdn.example/video.mp4' } }), state);
    }
    await expect(service(db, new Set()).requestDownload('job-1')).resolves.toMatchObject({
      status: 'queued', operation: { idempotencyKey: 'artifact:job-1:video-1:manual:2' },
    });
    expect(db.getAllSync("SELECT state FROM workflow_operations WHERE idempotency_key LIKE 'artifact:job-1:video-1%' ORDER BY idempotency_key")).toEqual([
      { state: 'SUCCEEDED' }, { state: 'FAILED' }, { state: 'PENDING' },
    ]);
  } finally { db.close(); }
});

test('rejects commands in recovery mode without appending work', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    seed(db);
    db.runSync("INSERT INTO app_database_recovery (id,diagnostic,created_at) VALUES (1,'TEST_RECOVERY',1)");
    await expect(service(db, new Set()).requestDownload('job-1')).rejects.toThrow('APP_DATABASE_READ_ONLY');
    expect(db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(0);
  } finally { db.close(); }
});
