// Notifications accelerate durable work; listener failures must never turn a
// committed command into a reported failure or prevent the remaining wakes.
export function notifyListeners<T extends unknown[]>(listeners: Iterable<(...args: T) => unknown>, ...args: T): void {
  const report = () => {
    try { console.warn('TASK_NOTIFICATION_LISTENER_FAILED'); } catch { /* diagnostics are best effort */ }
  };
  for (const listener of [...listeners]) {
    try {
      const result = listener(...args);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).catch(report);
      }
    } catch { report(); }
  }
}
