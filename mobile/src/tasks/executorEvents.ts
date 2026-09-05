export type ExecutorTrigger = 'command' | 'foreground' | 'connectivity' | 'timer' | 'background' | 'service';
export type ExecutorWorkState = Readonly<{ phase: 'idle' | 'scheduled' | 'running' | 'backoff'; nextWakeAt?: number; error?: string }>;

export function createExecutorEvents() {
  let state: ExecutorWorkState = Object.freeze({ phase: 'idle' });
  const observers = new Set<() => void>();
  const wakes = new Set<(trigger: ExecutorTrigger) => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { observers.add(listener); return () => { observers.delete(listener); }; },
    subscribeWake(listener: (trigger: ExecutorTrigger) => void) { wakes.add(listener); return () => { wakes.delete(listener); }; },
    publish(next: ExecutorWorkState) {
      if (state.phase === next.phase && state.nextWakeAt === next.nextWakeAt && state.error === next.error) return;
      state = Object.freeze(next);
      for (const listener of observers) listener();
    },
    signal(trigger: ExecutorTrigger) { for (const listener of wakes) listener(trigger); },
  };
}
export const executorEvents = createExecutorEvents();
export const executorWakePort = { signal: executorEvents.signal };
