const listeners = new Set<() => void>();
export const workflowCatalogEvents = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  invalidate() { for (const listener of listeners) listener(); },
};
