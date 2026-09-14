import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createTaskCommandService } from './taskCommandService';

test('command receipt observes atomic intent, projection and wake before returning without a worker', async () => {
  const db = createInitializedRealSqliteTestDb();
  db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,video_url,created_at,updated_at) VALUES('a','p','SUCCESS','720p',5,'https://cdn.example/v',1,1)");
  db.runSync("INSERT INTO media_assets(id,task_id,title,prompt,source_url,mime_type,status,created_at,updated_at,kind) VALUES('a:v','a','p','p','https://cdn.example/v','video/mp4','failed',1,1,'video')");
  let observed: unknown;
  const commands = createTaskCommandService({ db: db as never, now: () => 100, fileExists: async () => false, resolveCasUri: p => p,
    invalidate: () => { observed = db.getFirstSync('SELECT download_state,(SELECT generation FROM executor_wake_state) AS generation FROM tasks'); }, signal: () => undefined });
  try {
    expect(await commands.requestDownload('a')).toEqual({ status: 'accepted', wakeGeneration: 1, acceptedAt: 100 });
    expect(observed).toEqual({ download_state: 'ENQUEUED', generation: 1 });
    expect(await commands.requestDownload('a')).toMatchObject({ status: 'coalesced', wakeGeneration: 2 });
    expect(db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(1);
    const before = db.getFirstSync('SELECT * FROM tasks');
    await commands.requestRefresh({ maintenance: 'force-next-slice' });
    await commands.requestRefresh({ maintenance: 'force-next-slice' });
    expect(db.getFirstSync('SELECT * FROM tasks')).toEqual(before);
    expect(db.getFirstSync('SELECT generation,maintenance_generation FROM executor_wake_state')).toEqual({ generation: 4, maintenance_generation: 3 });
    db.execSync("CREATE TRIGGER reject_wake BEFORE UPDATE ON executor_wake_state BEGIN SELECT RAISE(ABORT,'wake failed'); END");
    await expect(commands.requestRedownload('a')).rejects.toThrow('wake failed');
    expect(db.getFirstSync('SELECT * FROM tasks')).toEqual(before);
  } finally { db.close(); }
});


test.each(['PENDING', 'CLAIMED', 'SUCCEEDED'])('cancel is atomic, idempotent and never cancels a submitted operation (%s)', async state => {
  const db = createInitializedRealSqliteTestDb();
  try {
    db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,created_at,updated_at) VALUES('c','p','QUEUED','720p',5,1,1)");
    db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES('c','h3','1','hash','a','1','{}','QUEUED',1,1)");
    db.runSync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES('submit','SUBMIT','c','submit:c','{}',?,?,1,1,1)", state, state === 'PENDING' ? 0 : 1);
    const commands = createTaskCommandService({ db: db as never, fileExists: async () => false, resolveCasUri: p => p, invalidate: () => undefined });
    if (state === 'PENDING') {
      await commands.requestCancel('c'); await commands.requestCancel('c');
      expect(db.getFirstSync('SELECT status FROM tasks')).toEqual({ status: 'CANCELLED' });
      expect(db.getFirstSync('SELECT state FROM workflow_operations')).toEqual({ state: 'BLOCKED' });
      expect(db.getAllSync('SELECT * FROM workflow_job_events')).toHaveLength(1);
    } else {
      await expect(commands.requestCancel('c')).rejects.toThrow('服务端');
      expect(db.getFirstSync('SELECT status FROM tasks')).toEqual({ status: 'QUEUED' });
    }
  } finally { db.close(); }
});


test('download cancellation clears leases and pending delivery intent before native completion', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    db.runSync("INSERT INTO tasks(id,prompt,status,resolution,duration,download_state,export_state,created_at,updated_at) VALUES('d','p','SUCCESS','720p',5,'DOWNLOADING','QUEUED',1,1)");
    db.runSync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,lease_owner,lease_expires_at,created_at,updated_at) VALUES('transfer','ARTIFACT_DOWNLOAD','d','artifact:d:v','{}','CLAIMED',1,1,'worker',9999,1,1)");
    const commands = createTaskCommandService({ db: db as never, fileExists: async () => false, resolveCasUri: p => p, invalidate: () => undefined });
    await commands.requestCancelMedia('d', 'ARTIFACT_DOWNLOAD');
    await commands.requestCancelMedia('d', 'ARTIFACT_DOWNLOAD');
    expect(db.getFirstSync('SELECT state,lease_owner FROM workflow_operations')).toEqual({ state: 'BLOCKED', lease_owner: null });
    expect(db.getFirstSync('SELECT download_state,export_state FROM tasks')).toEqual({ download_state: 'DOWNLOAD_FAILED', export_state: 'NOT_REQUESTED' });
  } finally { db.close(); }
});
