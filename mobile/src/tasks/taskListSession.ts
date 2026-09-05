import type { TaskCard, TaskCursor } from './taskCard';
import { ProjectionChangedDuringRead, type TaskProjectionActivity, type TaskProjectionRepository } from './projectionRepository';
import { executorEvents, type ExecutorWorkState } from './executorEvents';
import { taskProjectionEvents } from './taskProjectionEvents';

export type TaskListSnapshot = Readonly<{
  revision: number; phase: 'cold' | 'ready' | 'stale'; items: readonly TaskCard[]; nextCursor?: TaskCursor;
  read: Readonly<{ pending: boolean; lastCheckedAt?: number; lastChangedAt?: number; error?: string }>;
  work: ExecutorWorkState;
  activity: Readonly<{ activeTaskCount: number; remainingDue: number; remainingScheduled: number }>;
}>;
export type RefreshReceipt = { revision: number; checkedAt: number };
export interface TaskListSession {
  getSnapshot(): TaskListSnapshot;
  subscribe(listener: () => void): () => void;
  setVisible(visible: boolean): void;
  refresh(cause: 'focus' | 'manual'): Promise<RefreshReceipt>;
  loadMore(): Promise<void>;
  dispose(): void;
}
type Cause = 'focus' | 'manual' | 'event' | 'timer' | 'page';

function equalCard(a: TaskCard, b: TaskCard): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof TaskCard)[]);
  return [...keys].every(key => a[key] === b[key]);
}

export function createTaskListSession(deps: {
  repository: Pick<TaskProjectionRepository, 'readRevision' | 'readActivity' | 'readConsistentWindow'>;
  projections?: typeof taskProjectionEvents; work?: typeof executorEvents; now?: () => number; pageSize?: number;
}): TaskListSession {
  const repository = deps.repository;
  const events = deps.work ?? executorEvents;
  const now = deps.now ?? Date.now;
  const pageSize = Math.min(120, Math.max(1, deps.pageSize ?? 40));
  let limit = pageSize;
  let visible = false;
  let disposed = false;
  let dirty = false;
  let readPromise: Promise<RefreshReceipt> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let activity: TaskProjectionActivity = { activeTaskCount: 0, pendingOperationCount: 0, claimedOperationCount: 0, remainingDue: 0, remainingScheduled: 0 };
  let snapshot: TaskListSnapshot = Object.freeze({ revision: 0, phase: 'cold', items: Object.freeze([]), read: Object.freeze({ pending: false }), work: events.getSnapshot(), activity });
  const listeners = new Set<() => void>();
  const causes = new Set<Cause>();
  const publish = (next: TaskListSnapshot) => {
    if (disposed) return;
    snapshot = Object.freeze({ ...next, read: Object.freeze(next.read), activity: Object.freeze(next.activity) });
    for (const listener of listeners) listener();
  };
  const schedule = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!visible || disposed || readPromise) return;
    let delay: number | undefined;
    if (activity.remainingDue || activity.claimedOperationCount) delay = 1000;
    else if (activity.activeTaskCount) delay = Math.min(10000, Math.max(1000, (activity.nextWakeAt ?? now() + 10000) - now()));
    else if (activity.remainingScheduled && activity.nextWakeAt != null) delay = Math.max(1000, activity.nextWakeAt - now());
    if (delay != null) timer = setTimeout(() => { timer = undefined; void requestRead('timer').catch(() => undefined); }, delay);
  };
  const drain = async (): Promise<RefreshReceipt> => {
    let receipt = { revision: snapshot.revision, checkedAt: now() };
    let lastError: unknown;
    let conflicts = 0;
    while (dirty && !disposed) {
      dirty = false;
      const requested = new Set(causes);
      causes.clear();
      const currentSequence = ++sequence;
      publish({ ...snapshot, read: { ...snapshot.read, pending: true } });
      try {
        const full = snapshot.phase === 'cold' || requested.has('focus') || requested.has('manual') || requested.has('page');
        const revision = full ? undefined : await repository.readRevision();
        if (full || revision !== snapshot.revision) {
          const result = await repository.readConsistentWindow(limit);
          if (disposed || currentSequence !== sequence) break;
          if (result instanceof ProjectionChangedDuringRead || result.revision < snapshot.revision) {
            if (++conflicts >= 4) throw new Error('任务状态持续变化，请稍后重试');
            dirty = true; causes.add('focus'); continue;
          }
          const previous = new Map(snapshot.items.map(item => [item.id, item]));
          const cards = result.items.map(item => {
            const old = previous.get(item.id);
            return old && equalCard(old, item) ? old : Object.freeze(item);
          });
          const items = cards.length === snapshot.items.length && cards.every((item, index) => item === snapshot.items[index]) ? snapshot.items : Object.freeze(cards);
          activity = result.activity;
          receipt = { revision: result.revision, checkedAt: now() };
          publish({ ...snapshot, revision: result.revision, phase: 'ready', items, nextCursor: limit < 120 ? result.nextCursor : undefined,
            activity, read: { pending: true, lastCheckedAt: receipt.checkedAt,
              lastChangedAt: result.revision !== snapshot.revision || snapshot.phase === 'cold' ? receipt.checkedAt : snapshot.read.lastChangedAt } });
        } else {
          const nextActivity = await repository.readActivity(now());
          if (disposed || currentSequence !== sequence) break;
          if (await repository.readRevision() !== revision) { dirty = true; causes.add('event'); continue; }
          activity = nextActivity;
          receipt = { revision: snapshot.revision, checkedAt: now() };
          publish({ ...snapshot, phase: 'ready', activity, read: { ...snapshot.read, pending: true, error: undefined, lastCheckedAt: receipt.checkedAt } });
        }
        lastError = undefined;
      } catch (error) {
        lastError = error;
        publish({ ...snapshot, phase: 'stale', read: { ...snapshot.read, error: error instanceof Error ? error.message : String(error) } });
      }
    }
    publish({ ...snapshot, read: { ...snapshot.read, pending: false } });
    if (lastError) throw lastError;
    return receipt;
  };
  const requestRead = (cause: Cause): Promise<RefreshReceipt> => {
    if (disposed) return Promise.resolve({ revision: snapshot.revision, checkedAt: now() });
    dirty = true; causes.add(cause);
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!readPromise) readPromise = drain().finally(() => { readPromise = undefined; schedule(); });
    return readPromise;
  };
  const unsubscribeProjection = (deps.projections ?? taskProjectionEvents).subscribe(() => {
    if (visible) void requestRead('event').catch(() => undefined);
  });
  const unsubscribeWork = events.subscribe(() => {
    publish({ ...snapshot, work: events.getSnapshot() });
    if (visible && events.getSnapshot().phase !== 'running') void requestRead('event').catch(() => undefined);
  });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setVisible(next) {
      if (disposed || next === visible) return;
      visible = next;
      if (visible) void requestRead('focus').catch(() => undefined);
      else if (timer) { clearTimeout(timer); timer = undefined; }
    },
    refresh: requestRead,
    async loadMore() {
      if (!snapshot.nextCursor || limit >= 120 || readPromise) return;
      limit = Math.min(120, limit + pageSize);
      await requestRead('page');
    },
    dispose() {
      disposed = true; sequence++;
      if (timer) clearTimeout(timer);
      unsubscribeProjection(); unsubscribeWork(); listeners.clear();
    },
  };
}
