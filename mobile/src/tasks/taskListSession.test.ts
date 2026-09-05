import { createTaskListSession } from './taskListSession';
import { createTaskProjectionEvents } from './taskProjectionEvents';
import { createExecutorEvents } from './executorEvents';
import { ProjectionChangedDuringRead, type TaskProjectionActivity, type ConsistentTaskProjectionWindow } from './projectionRepository';

const activity: TaskProjectionActivity = { activeTaskCount: 0, pendingOperationCount: 0, claimedOperationCount: 0, remainingDue: 0, remainingScheduled: 0 };
const card = (id = 'a', prompt = 'hello') => ({ id, prompt, status: 'SUCCESS' as const, resolution: '720p', duration: 5, createdAt: 1, updatedAt: 1, downloadState: 'IDLE' as const, exportState: 'NOT_REQUESTED' as const });
function setup(initialActivity = activity) {
  let revision = 1;
  let items = [card()];
  let reads = 0;
  let fail = false;
  const limits: number[] = [];
  const projections = createTaskProjectionEvents();
  const work = createExecutorEvents();
  const repository = {
    readRevision: async () => { if (fail) throw new Error('read failed'); return revision; },
    readActivity: async () => initialActivity,
    readWindow: async () => ({ items: [card('older')], nextCursor: undefined }),
    readConsistentWindow: async (limit = 40): Promise<ConsistentTaskProjectionWindow | ProjectionChangedDuringRead> => {
      reads++; limits.push(limit);
      if (fail) throw new Error('read failed');
      return { revision, items: items.map(item => ({ ...item })), activity: initialActivity, nextCursor: { id: 'a', createdAt: 1 } };
    },
  };
  const session = createTaskListSession({ repository, projections, work });
  return { session, repository, projections, work, limits, reads: () => reads, change: (next = items) => { revision++; items = next; }, fail: (value: boolean) => { fail = value; } };
}
afterEach(() => jest.useRealTimers());

test('hydrates immediately, reuses unchanged cards and performs zero reconstruction on unchanged revision', async () => {
  jest.useFakeTimers();
  const s = setup({ ...activity, activeTaskCount: 1 });
  expect(s.session.getSnapshot().phase).toBe('cold');
  s.session.setVisible(true);
  await jest.advanceTimersByTimeAsync(0);
  const first = s.session.getSnapshot().items[0];
  s.projections.invalidate();
  await jest.advanceTimersByTimeAsync(0);
  expect(s.reads()).toBe(1);
  s.change();
  await jest.advanceTimersByTimeAsync(10000);
  expect(s.session.getSnapshot().revision).toBe(2);
  expect(s.session.getSnapshot().items[0]).toBe(first);
  s.change([card('a', 'changed')]);
  await s.session.refresh('manual');
  expect(s.session.getSnapshot().items[0]).not.toBe(first);
  s.session.dispose();
  expect(jest.getTimerCount()).toBe(0);
});

test('ten overlapping requests guarantee one trailing read and dispose rejects stale completions', async () => {
  const s = setup();
  let finish!: (value: ConsistentTaskProjectionWindow) => void;
  const realRead = s.repository.readConsistentWindow;
  let reads = 0;
  s.repository.readConsistentWindow = async limit => {
    reads++;
    return reads === 1 ? new Promise(resolve => { finish = resolve; }) : realRead(limit);
  };
  const requests = Array.from({ length: 10 }, () => s.session.refresh('manual'));
  finish({ revision: 0, items: [], activity });
  await Promise.all(requests);
  expect(reads).toBe(2);
  expect(s.session.getSnapshot().items[0].id).toBe('a');
  s.repository.readConsistentWindow = async () => new Promise(resolve => { finish = resolve; });
  const pending = s.session.refresh('manual');
  s.session.dispose();
  const disposed = s.session.getSnapshot();
  finish({ revision: 9, items: [], activity });
  await pending;
  expect(s.session.getSnapshot()).toBe(disposed);
});

test('automatic error retains items as stale and manual error rejects; successful check clears it', async () => {
  jest.useFakeTimers();
  const s = setup();
  s.session.setVisible(true);
  await jest.advanceTimersByTimeAsync(0);
  const first = s.session.getSnapshot().items;
  s.fail(true);
  s.projections.invalidate();
  await jest.advanceTimersByTimeAsync(0);
  expect(s.session.getSnapshot()).toMatchObject({ phase: 'stale', items: first, read: { pending: false, error: 'read failed' } });
  await expect(s.session.refresh('manual')).rejects.toThrow('read failed');
  s.fail(false);
  await s.session.refresh('manual');
  expect(s.session.getSnapshot().phase).toBe('ready');
  s.session.dispose();
});

test('refreshes a bounded loaded window after pagination, merging reorder and deletion', async () => {
  const s = setup();
  await s.session.refresh('focus');
  s.change([card('b'), card('a')]);
  await s.session.loadMore();
  expect(s.session.getSnapshot().items.map(item => item.id)).toEqual(['b', 'a']);
  s.change([card('b')]);
  await s.session.refresh('manual');
  expect(s.session.getSnapshot().items.map(item => item.id)).toEqual(['b']);
  await s.session.loadMore();
  await s.session.loadMore();
  expect(s.limits).toEqual([40, 80, 80, 120]);
  expect(s.session.getSnapshot().items.map(item => item.id)).toEqual(['b', 'older']);
  s.session.dispose();
});

test('invalidation requested by a completion subscriber is not lost', async () => {
  const s = setup();
  let once = false;
  const unsubscribe = s.session.subscribe(() => {
    if (!s.session.getSnapshot().read.pending && !once) {
      once = true; s.change([card('new')]); void s.session.refresh('manual');
    }
  });
  await s.session.refresh('manual');
  expect(s.session.getSnapshot().items[0].id).toBe('new');
  unsubscribe(); s.session.dispose();
});

test('a refresh requested synchronously by a pending subscriber stays single-flight', async () => {
  const s = setup();
  let once = false;
  let active = 0;
  let maximum = 0;
  const read = s.repository.readConsistentWindow;
  s.repository.readConsistentWindow = async limit => {
    maximum = Math.max(maximum, ++active);
    await Promise.resolve();
    active--;
    return read(limit);
  };
  s.session.subscribe(() => {
    if (s.session.getSnapshot().read.pending && !once) {
      once = true; void s.session.refresh('manual');
    }
  });
  await s.session.refresh('focus');
  expect(maximum).toBe(1);
  expect(s.reads()).toBe(2);
  s.session.dispose();
});

test.each([
  [activity, 0],
  [{ ...activity, activeTaskCount: 1 }, 10000],
  [{ ...activity, remainingDue: 1 }, 1000],
  [{ ...activity, claimedOperationCount: 1 }, 1000],
  [{ ...activity, remainingScheduled: 1, nextWakeAt: 30000 }, 30000],
])('visible checking policy uses full database activity %j', async (state, delay) => {
  jest.useFakeTimers({ now: 0 });
  const s = setup(state);
  let checks = 0;
  s.repository.readRevision = async () => { checks++; return 1; };
  s.session.setVisible(true);
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(delay ? 1 : 0);
  if (delay) {
    await jest.advanceTimersByTimeAsync(delay - 1);
    expect(checks).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(checks).toBe(2); // Revision fence around the single activity check.
  }
  s.session.setVisible(false);
  expect(jest.getTimerCount()).toBe(0);
  s.session.dispose();
});

test('revision conflict schedules trailing read without publishing inconsistent cards', async () => {
  const s = setup();
  const real = s.repository.readConsistentWindow;
  let first = true;
  s.repository.readConsistentWindow = async limit => {
    if (first) { first = false; return new ProjectionChangedDuringRead(2); }
    return real(limit);
  };
  await s.session.refresh('manual');
  expect(s.session.getSnapshot()).toMatchObject({ phase: 'ready', revision: 1 });
  s.session.dispose();
});

