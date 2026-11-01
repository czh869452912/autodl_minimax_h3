type RunEvent = { threadId: string; kind: 'accepted' | 'status-changed' };
const listeners = new Set<(event: RunEvent) => void>();
/** Durable run lifecycle events, published only after transaction commit. */
export const runEvents = {
  subscribe(listener: (event: RunEvent) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  publish(event: RunEvent) {
    for (const listener of listeners) {
      try { listener(event); } catch { /* Observers cannot invalidate committed data. */ }
    }
  },
};
