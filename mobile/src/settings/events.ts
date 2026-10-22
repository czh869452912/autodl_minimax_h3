import { notifyListeners } from '../tasks/notifyListeners';
const listeners = new Set<() => void>();
export const settingsEvents = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  publish() { notifyListeners(listeners); },
};
