type Listener = (threadId: string) => void;
const listeners = new Set<Listener>();

/** Publish only after the owning write transaction has committed. */
export const skillSelectionEvents = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  publish(threadId: string) {
    for (const listener of listeners) {
      try { listener(threadId); }
      catch { /* A UI observer cannot invalidate a committed submission. */ }
    }
  },
};
