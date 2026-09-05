import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { persistSubmissionCommand } from './submissionCommand';

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
