import { createExecutorEvents } from './executorEvents';
import { createTaskProjectionEvents, taskProjectionEvents } from './taskProjectionEvents';
import { executorEvents } from './executorEvents';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { persistSubmissionCommand } from '../create/submissionCommand';

test('faulty synchronous and asynchronous listeners do not prevent remaining notifications', async () => {
  const log = jest.spyOn(console, 'warn').mockImplementation(() => { throw new Error('logging failed'); });
  const projections = createTaskProjectionEvents();
  const events = createExecutorEvents();
  const received = jest.fn();
  projections.subscribe(() => { throw new Error('bad observer'); });
  projections.subscribe(async () => { throw new Error('async observer'); });
  projections.subscribe(received);
  events.subscribe(() => { throw new Error('bad state observer'); });
  events.subscribe(received);
  events.subscribeWake(() => { throw new Error('bad wake observer'); });
  events.subscribeWake(received);
  try {
    projections.invalidate();
    events.publish({ phase: 'running' });
    events.signal('command');
    await Promise.resolve();
    expect(received).toHaveBeenCalledTimes(3);
    expect(events.getSnapshot().phase).toBe('running');
  } finally { log.mockRestore(); }
});

test('projection failure after commit does not reject submission or suppress executor wake', async () => {
  const db = createInitializedRealSqliteTestDb();
  const log = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const removeBroken = taskProjectionEvents.subscribe(() => { throw new Error('broken view'); });
  const wake = jest.fn();
  const removeWake = executorEvents.subscribeWake(wake);
  try {
    const prepared = { workflowId: 'w', workflowVersion: '1', workflowContentHash: 'h', adapterId: 'a', adapterVersion: '1', inputSnapshot: {} } as never;
    await expect(persistSubmissionCommand(db as never, 'notification-test', prepared, { images: [], audios: [] })).resolves.toMatchObject({ id: 'job:notification-test' });
    expect(wake).toHaveBeenCalledWith('command');
    expect(db.getAllSync('SELECT id FROM workflow_jobs')).toHaveLength(1);
  } finally { removeBroken(); removeWake(); log.mockRestore(); db.close(); }
});
