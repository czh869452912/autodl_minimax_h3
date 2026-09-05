import type { JobRecord } from '../../jobs/types';
import { createInitializedRealSqliteTestDb } from '../../test/realSqlite';
import { createOperationRepository } from './operationRepository';
import { createJobStateRepository } from './jobStateRepository';

const job: JobRecord = {
  id: 'job-1', revision: 0, workflowId: 'demo', workflowVersion: '1.0.0', workflowContentHash: 'hash',
  adapterId: 'demo', adapterVersion: '1.0.0', inputSnapshot: { prompt: 'x' }, status: 'READY_TO_SUBMIT',
  createdAt: 100, updatedAt: 100,
};

const initialEvent = { id: 'event-0', type: 'VALIDATED', payload: {}, createdAt: 100 };
const submitOperation = {
  id: 'submit-1', kind: 'SUBMIT' as const, jobId: 'job-1', idempotencyKey: 'submit:job-1',
  payload: { jobId: 'job-1' }, now: 100,
};
const acceptedTransition = {
  jobId: 'job-1',
  expectedRevision: 0,
  patch: { status: 'QUEUED' as const, providerHandle: { providerJobId: 'remote-1' }, updatedAt: 200 },
  event: { id: 'event-1', type: 'SUBMIT_ACCEPTED', payload: { providerJobId: 'remote-1' }, createdAt: 200 },
  nextOperations: [{
    id: 'status-1', kind: 'STATUS_SYNC' as const, jobId: 'job-1',
    idempotencyKey: 'status:job-1:1', payload: { jobId: 'job-1' }, now: 200,
  }],
};

function setup() {
  const db = createInitializedRealSqliteTestDb();
  const jobs = createJobStateRepository(db as never);
  const operations = createOperationRepository(db as never);
  return { db, jobs, operations };
}

test('creates the initial snapshot, sequence-zero event, and submit operation atomically', async () => {
  const { db, jobs, operations } = setup();
  try {
    expect((await jobs.createWithEventAndOperation(job, initialEvent, submitOperation))).toMatchObject({ id: 'job-1', revision: 0 });
    expect((await jobs.listEvents('job-1'))).toMatchObject([{ sequence: 0, type: 'VALIDATED' }]);
    expect(await operations.get('submit-1')).toMatchObject({ kind: 'SUBMIT', state: 'PENDING' });
    expect((await jobs.createWithEventAndOperation({ ...job, status: 'FAILED' }, { ...initialEvent, id: 'other-event' }, { ...submitOperation, id: 'other-submit' })))
      .toMatchObject({ id: 'job-1', status: 'READY_TO_SUBMIT' });
    expect((await jobs.listEvents('job-1'))).toHaveLength(1);
    expect(operations.list('SUBMIT')).toHaveLength(1);
  } finally { db.close(); }
});

test('a committed job transition updates the task status immediately and preserves downloaded media', async () => {
  const { db, jobs } = setup();
  try {
    await (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
    db.runSync("INSERT OR REPLACE INTO tasks(id,prompt,status,resolution,duration,local_uri,download_state,gallery_uri,export_state,created_at,updated_at) VALUES ('job-1','x','RUNNING','480p',1,'file:///saved.mp4','DOWNLOADED','content://saved','EXPORTED',100,900)");
    await (await jobs.transition({ ...acceptedTransition, patch: { status: 'SUCCEEDED', updatedAt: 200, executionDuration: 10 },
      artifacts: [{ id: 'v', jobId: job.id, kind: 'video', uri: 'https://cdn.test/v.mp4' }] }));
    expect(db.getFirstSync('SELECT status,local_uri,download_state,gallery_uri,export_state,execution_duration FROM tasks WHERE id=?', job.id)).toEqual({
      status: 'SUCCESS', local_uri: 'file:///saved.mp4', download_state: 'DOWNLOADED', gallery_uri: 'content://saved', export_state: 'EXPORTED', execution_duration: 10,
    });
    db.execSync("CREATE TRIGGER reject_projection BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT,'projection rejected'); END");
    await expect(Promise.resolve().then(async () => (await jobs.transition({ ...acceptedTransition, expectedRevision: 1, event: { ...acceptedTransition.event, id: 'rejected' } })))).rejects.toThrow('projection rejected');
    expect(db.getFirstSync('SELECT status,revision FROM workflow_jobs WHERE id=?', job.id)).toEqual({ status: 'SUCCEEDED', revision: 1 });
  } finally { db.close(); }
});

test('job creation, transitions, projections and notification reads do not call synchronous SQLite queries', async () => {
  const { db, jobs } = setup();
  const forbidden = () => { throw new Error('synchronous SQLite query'); };
  jest.spyOn(db, 'getFirstSync').mockImplementation(forbidden);
  jest.spyOn(db, 'getAllSync').mockImplementation(forbidden);
  jest.spyOn(db, 'runSync').mockImplementation(forbidden);
  try {
    await jobs.createWithEventAndOperation(job, initialEvent, submitOperation);
    await jobs.transition(acceptedTransition);
    expect(await jobs.get(job.id)).toMatchObject({ status: 'QUEUED' });
    expect(await jobs.listEvents(job.id)).toHaveLength(2);
    expect(await jobs.listTerminalEvents([job.id])).toEqual([]);
  } finally { db.close(); }
});

test('updates snapshot, appends event, and enqueues next work atomically', async () => {
  const { db, jobs, operations } = setup();
  try {
    (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
    const result = (await jobs.transition(acceptedTransition));
    expect(result.ok).toBe(true);
    expect((await jobs.get('job-1'))).toMatchObject({ revision: 1, status: 'QUEUED', providerHandle: { providerJobId: 'remote-1' } });
    expect((await jobs.listEvents('job-1'))).toMatchObject([
      { sequence: 0, type: 'VALIDATED' },
      { sequence: 1, type: 'SUBMIT_ACCEPTED' },
    ]);
    expect(await operations.get('status-1')).toMatchObject({ kind: 'STATUS_SYNC' });
  } finally { db.close(); }
});

test('replaces artifacts with the job transition, event, and next operation', async () => {
  const { db, jobs, operations } = setup();
  try {
    (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
    const result = (await jobs.transition({
      jobId: job.id,
      expectedRevision: job.revision,
      patch: { status: 'SUCCEEDED', updatedAt: 200 },
      artifacts: [{
        id: 'video-1', jobId: job.id, kind: 'video',
        uri: 'https://cdn.test/video.mp4', mime: 'video/mp4',
      }],
      event: { id: 'status-done', type: 'STATUS_RECONCILED', payload: { status: 'SUCCEEDED' }, createdAt: 200 },
      nextOperations: [{
        id: 'download-1', kind: 'ARTIFACT_DOWNLOAD', jobId: job.id,
        idempotencyKey: `artifact:${job.id}:video-1`, payload: {}, now: 200,
      }],
    }));

    expect(result.ok).toBe(true);
    expect(db.getAllSync(
      'SELECT id, kind, uri FROM workflow_artifacts WHERE job_id = ?', job.id,
    )).toEqual([{ id: 'video-1', kind: 'video', uri: 'https://cdn.test/video.mp4' }]);
    expect(await operations.get('download-1')).toMatchObject({ state: 'PENDING' });
  } finally { db.close(); }
});

test('rolls back job, event, artifacts, and operations when artifact replacement fails', async () => {
  const { db, jobs, operations } = setup();
  try {
    (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
    await expect(jobs.transition({
      jobId: job.id,
      expectedRevision: job.revision,
      patch: { status: 'SUCCEEDED', updatedAt: 200 },
      artifacts: [
        { id: 'same', jobId: job.id, kind: 'video' },
        { id: 'same', jobId: job.id, kind: 'image' },
      ],
      event: { id: 'status-done', type: 'STATUS_RECONCILED', payload: {}, createdAt: 200 },
      nextOperations: [{
        id: 'download-1', kind: 'ARTIFACT_DOWNLOAD', jobId: job.id,
        idempotencyKey: `artifact:${job.id}:same`, payload: {}, now: 200,
      }],
    })).rejects.toThrow();

    expect((await jobs.get(job.id))).toMatchObject({ revision: 0, status: 'READY_TO_SUBMIT' });
    expect((await jobs.listEvents(job.id))).toHaveLength(1);
    expect(db.getAllSync('SELECT * FROM workflow_artifacts WHERE job_id = ?', job.id)).toEqual([]);
    expect(await operations.get('download-1')).toBeUndefined();
  } finally { db.close(); }
});

test('returns current snapshot on CAS conflict without duplicate effects', async () => {
  const { db, jobs, operations } = setup();
  try {
    (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
    (await jobs.transition(acceptedTransition));
    const result = (await jobs.transition({ ...acceptedTransition, event: { ...acceptedTransition.event, id: 'event-2' } }));
    expect(result).toEqual({ ok: false, current: expect.objectContaining({ revision: 1 }) });
    expect((await jobs.listEvents('job-1'))).toHaveLength(2);
    expect(operations.list('STATUS_SYNC')).toHaveLength(1);
  } finally { db.close(); }
});

test('rolls back the snapshot when event insertion fails', async () => {
  const { db, jobs, operations } = setup();
  (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
  const runAsync = db.runAsync.bind(db);
  jest.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
    if (sql.includes('workflow_job_events') && params[0] === 'event-1') throw new Error('event insert failed');
    return runAsync(sql, ...params);
  });
  try {
    await expect(jobs.transition(acceptedTransition)).rejects.toThrow('event insert failed');
    expect((await jobs.get('job-1'))).toMatchObject({ revision: 0, status: 'READY_TO_SUBMIT' });
    expect((await jobs.listEvents('job-1'))).toHaveLength(1);
    expect(await operations.get('status-1')).toBeUndefined();
  } finally { db.close(); }
});

test('rolls back snapshot and event when next-operation insertion fails', async () => {
  const { db, jobs, operations } = setup();
  (await jobs.createWithEventAndOperation(job, initialEvent, submitOperation));
  const runAsync = db.runAsync.bind(db);
  jest.spyOn(db, 'runAsync').mockImplementation(async (sql: string, ...params: unknown[]) => {
    if (sql.includes('workflow_operations') && params[0] === 'status-1') throw new Error('operation insert failed');
    return runAsync(sql, ...params);
  });
  try {
    await expect(jobs.transition(acceptedTransition)).rejects.toThrow('operation insert failed');
    expect((await jobs.get('job-1'))).toMatchObject({ revision: 0, status: 'READY_TO_SUBMIT' });
    expect((await jobs.listEvents('job-1'))).toHaveLength(1);
    expect(await operations.get('status-1')).toBeUndefined();
  } finally { db.close(); }
});

test('lists only scoped terminal reconciliation events in stable creation order', async () => {
  const { db, jobs } = setup();
  try {
    for (const [id, status] of [['job-1', 'SUCCEEDED'], ['job-2', 'FAILED'], ['job-3', 'RUNNING']] as const) {
      db.runSync(
        "INSERT INTO workflow_jobs (id,revision,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES (?,0,'demo','1','hash','demo','1','{}',?,1,1)",
        id, status,
      );
    }
    const sequences = new Map<string, number>();
    const insert = (id: string, jobId: string, type: string, payload: object, createdAt: number) => {
      const sequence = sequences.get(jobId) ?? 0;
      sequences.set(jobId, sequence + 1);
      db.runSync(
        'INSERT INTO workflow_job_events (id,job_id,sequence,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?)',
        id, jobId, sequence, type, JSON.stringify(payload), createdAt,
      );
    };
    insert('event-running', 'job-3', 'STATUS_RECONCILED', { status: 'RUNNING' }, 10);
    insert('event-retry', 'job-2', 'STATUS_RETRY_SCHEDULED', { code: 'NETWORK' }, 11);
    insert('event-success', 'job-1', 'STATUS_RECONCILED', { status: 'SUCCEEDED' }, 20);
    insert('event-sync-failed', 'job-2', 'STATUS_SYNC_FAILED', { code: 'NETWORK' }, 21);
    insert('event-failed', 'job-2', 'STATUS_RECONCILED', { status: 'FAILED' }, 20);

    expect((await jobs.listTerminalEvents(['job-2', 'job-1']))).toEqual([
      { eventId: 'event-failed', taskId: 'job-2', status: 'FAILED', createdAt: 20 },
      { eventId: 'event-success', taskId: 'job-1', status: 'SUCCESS', createdAt: 20 },
    ]);
    expect((await jobs.listTerminalEvents(['job-3']))).toEqual([]);
    expect((await jobs.listTerminalEvents([]))).toEqual([]);
  } finally { db.close(); }
});
