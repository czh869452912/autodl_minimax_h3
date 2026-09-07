import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { persistSubmissionCommand } from './submissionCommand';
import { createTaskRepository } from '../tasks/repository';

test('submit persists job, operation, task and wake atomically and duplicate intent is stable', async () => {
  const db = createInitializedRealSqliteTestDb();
  const prepared = { workflowId: 'w', workflowVersion: '1', workflowContentHash: 'hash', adapterId: 'a', adapterVersion: '1', inputSnapshot: { prompt: 'hello' } } as never;
  try {
    expect(await persistSubmissionCommand(db as never, 'one', prepared, { images: [], audios: [] }, 100)).toMatchObject({ id: 'job:one', status: 'QUEUED' });
    await persistSubmissionCommand(db as never, 'one', prepared, { images: [], audios: [] }, 101);
    expect(db.getAllSync('SELECT * FROM workflow_operations')).toHaveLength(1);
    expect(db.getFirstSync('SELECT generation FROM executor_wake_state')).toEqual({ generation: 2 });
    db.execSync("CREATE TRIGGER reject_submit_wake BEFORE UPDATE ON executor_wake_state BEGIN SELECT RAISE(ABORT,'wake failed'); END");
    await expect(persistSubmissionCommand(db as never, 'two', prepared, { images: [], audios: [] }, 102)).rejects.toThrow('wake failed');
    expect(db.getAllSync('SELECT id FROM workflow_jobs')).toEqual([{ id: 'job:one' }]);
  } finally { db.close(); }
});

test('submission atomically retains CAS task inputs and completes the applied handoff, including rollback and deletion', async () => {
  const db = createInitializedRealSqliteTestDb();
  const hash = 'b'.repeat(64);
  const uri = `asset://${hash}`;
  const prepared = { workflowId: 'w', workflowVersion: '1', workflowContentHash: 'hash', adapterId: 'a', adapterVersion: '1', inputSnapshot: { prompt: 'hello', images: [{ uri }] } } as never;
  try {
    db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, 3, 'image/png', `cas/sha256/bb/${hash}`, 1, 1);
    db.runSync('INSERT INTO artifact_blob_refs VALUES(?,?,?,?)', hash, 'create_form', 'handoff', 1);
    db.runSync('INSERT INTO agent_handoffs VALUES(?,?,?,?)', 'handoff', JSON.stringify({ id: 'handoff' }), 'applied', 1);
    db.execSync("CREATE TRIGGER reject_owned_wake BEFORE UPDATE ON executor_wake_state BEGIN SELECT RAISE(ABORT,'wake failed'); END");
    await expect(persistSubmissionCommand(db as never, 'owned', prepared, { images: [{ uri }], audios: [], handoffId: 'handoff' }, 10)).rejects.toThrow('wake failed');
    expect(db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(db.getFirstSync('SELECT status FROM agent_handoffs')).toEqual({ status: 'applied' });
    expect(db.getAllSync('SELECT owner_type FROM artifact_blob_refs')).toEqual([{ owner_type: 'create_form' }]);
    db.execSync('DROP TRIGGER reject_owned_wake');
    const task = await persistSubmissionCommand(db as never, 'owned', prepared, { images: [{ uri }], audios: [], handoffId: 'handoff' }, 11);
    expect(db.getFirstSync('SELECT status FROM agent_handoffs')).toEqual({ status: 'submitted' });
    expect(db.getAllSync('SELECT owner_type,owner_id FROM artifact_blob_refs')).toEqual([{ owner_type: 'task_input', owner_id: task.id }]);
    await persistSubmissionCommand(db as never, 'owned', prepared, { images: [{ uri }], audios: [], handoffId: 'handoff' }, 12);
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(1);
    db.runSync("UPDATE tasks SET status='SUCCESS' WHERE id=?", task.id);
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(1);
    await createTaskRepository(db as never).remove(task.id);
    expect(db.getAllSync('SELECT * FROM artifact_blob_refs')).toHaveLength(0);
  } finally { db.close(); }
});
