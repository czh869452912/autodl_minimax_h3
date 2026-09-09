import { notifyListeners } from './notifyListeners';

export function createTaskProjectionEvents() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    invalidate() { notifyListeners(listeners); },
  };
}
export const taskProjectionEvents = createTaskProjectionEvents();
