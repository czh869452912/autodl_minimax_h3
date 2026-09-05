export function createTaskProjectionEvents() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    invalidate() { for (const listener of listeners) listener(); },
  };
}
export const taskProjectionEvents = createTaskProjectionEvents();
