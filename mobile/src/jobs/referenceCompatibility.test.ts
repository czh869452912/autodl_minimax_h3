import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createJobRepository } from './repository';
import { createJobStateRepository } from '../workflows/executor/jobStateRepository';
import type { JobRecord } from './types';
import { createTaskRepository } from '../tasks/repository';

const job: JobRecord = { id: 'job', revision: 0, workflowId: 'w', workflowVersion: '1', workflowContentHash: 'h', adapterId: 'a', adapterVersion: '1', inputSnapshot: {}, status: 'RUNNING', createdAt: 1, updatedAt: 1 };

test('job and retained artifact identities survive updates with restrictive child references', async () => {
  const db = createInitializedRealSqliteTestDb();
  try {
    db.execSync('PRAGMA foreign_keys=ON');
    const store = createJobRepository(db as never);
    await store.upsert(job);
    await store.replaceArtifacts(job.id, [{ id: 'image', jobId: job.id, kind: 'image', uri: 'old' }]);
    db.execSync('CREATE TABLE test_origin(job_id TEXT REFERENCES workflow_jobs(id) ON DELETE RESTRICT); INSERT INTO test_origin VALUES (\'job\'); CREATE TABLE test_output(job_id TEXT, artifact_id TEXT, FOREIGN KEY(job_id,artifact_id) REFERENCES workflow_artifacts(job_id,id) ON DELETE RESTRICT); INSERT INTO test_output VALUES (\'job\',\'image\')');
    await store.upsert({ ...job, createdAt: 999, updatedAt: 2 });
    expect((await store.get(job.id))?.createdAt).toBe(1);
    await store.replaceArtifacts(job.id, [{ id: 'image', jobId: job.id, kind: 'image', uri: 'new' }]);
    const durable = createJobStateRepository(db as never, async () => {});
    expect(await durable.transition({ jobId: job.id, expectedRevision: 0, patch: { status: 'SUCCEEDED', updatedAt: 3 }, event: { id: 'done', type: 'done', payload: {}, createdAt: 3 }, artifacts: [{ id: 'image', jobId: job.id, kind: 'image', uri: 'final' }] })).toMatchObject({ ok: true });
    expect((await store.listArtifacts(job.id))[0].uri).toBe('final');
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    // Removing a referenced output fails atomically, including prior upserts.
    await expect(store.replaceArtifacts(job.id, [{ id: 'other', jobId: job.id, kind: 'image' }])).rejects.toThrow();
    expect((await store.listArtifacts(job.id)).map(a => a.id)).toEqual(['image']);
    await expect(store.replaceArtifacts(job.id, [{ id: 'image', jobId: 'wrong', kind: 'image' }])).rejects.toThrow('ARTIFACT_JOB_MISMATCH');
    await expect(store.replaceArtifacts(job.id, [
      { id: 'image', jobId: job.id, kind: 'image' },
      { id: 'image', jobId: job.id, kind: 'image' },
    ])).rejects.toThrow('DUPLICATE_ARTIFACT_ID');
    await expect(durable.transition({ jobId: job.id, expectedRevision: 1, patch: { status: 'FAILED' }, event: { id: 'bad', type: 'bad', payload: {}, createdAt: 4 }, artifacts: [] })).rejects.toThrow();
    expect((await store.get(job.id))?.status).toBe('SUCCEEDED');
    expect(db.getFirstSync('SELECT id FROM workflow_job_events WHERE id=\'bad\'')).toBeUndefined();
    // A task cleanup must not partially remove durable state before its FK failure.
    db.runSync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES('op','EXPORT',?,'export','{}','PENDING',0,0,0,0)", job.id);
    await expect(createTaskRepository(db as never).remove(job.id)).rejects.toThrow();
    expect(db.getFirstSync("SELECT id FROM workflow_operations WHERE id='op'")).toBeDefined();
    expect(await store.get(job.id)).toBeDefined();
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  } finally { db.close(); }
});
