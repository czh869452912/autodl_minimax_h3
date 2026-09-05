import { executorEvents, type createExecutorEvents, type ExecutorTrigger } from './executorEvents';
import type { ExecutorRunner } from './executorRunner';

export function startForegroundExecutorScheduler(deps: {
  runner: ExecutorRunner; events?: ReturnType<typeof createExecutorEvents>; now?: () => number; random?: () => number;
}) {
  const events = deps.events ?? executorEvents;
  const now = deps.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let dirty = false;
  let failures = 0;
  const schedule = (at: number, backoffError?: string) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    events.publish({ phase: backoffError ? 'backoff' : 'scheduled', nextWakeAt: at, ...(backoffError ? { error: backoffError } : {}) });
    timer = setTimeout(() => { timer = undefined; void run('timer'); }, Math.max(0, at - now()));
  };
  const run = async (trigger: ExecutorTrigger) => {
    if (stopped) return;
    if (running) { dirty = true; return; }
    running = true;
    dirty = false;
    events.publish({ phase: 'running' });
    try {
      const result = await deps.runner.runSlice({ trigger });
      failures = 0;
      if (stopped) return;
      if (dirty || result.remainingDue > 0 || result.budgetExhausted) schedule(now() + 1000);
      else if (result.nextWakeAt != null) schedule(Math.max(now() + 1000, result.nextWakeAt));
      else events.publish({ phase: 'idle' });
    } catch (error) {
      failures++;
      const delay = Math.min(60000, 1000 * 2 ** Math.min(failures - 1, 6) + Math.floor((deps.random ?? Math.random)() * 250));
      schedule(now() + delay, error instanceof Error ? error.message : String(error));
    } finally { running = false; }
  };
  const unsubscribe = events.subscribeWake(trigger => {
    if (stopped) return;
    if (running) { dirty = true; return; }
    if (timer) { clearTimeout(timer); timer = undefined; }
    void run(trigger);
  });
  schedule(now());
  return { stop() {
    stopped = true;
    unsubscribe();
    if (timer) clearTimeout(timer);
    events.publish({ phase: 'idle' });
  } };
}
