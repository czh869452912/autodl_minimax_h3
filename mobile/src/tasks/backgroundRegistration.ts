import { notifyListeners } from './notifyListeners';

export type BackgroundRegistrationState = Readonly<{
  phase: 'unregistered' | 'registering' | 'registered' | 'failed';
  lastAttemptAt?: number;
  error?: 'BACKGROUND_QUERY_FAILED' | 'BACKGROUND_REGISTER_FAILED';
}>;

export function createBackgroundRegistration(deps: { isRegistered(): Promise<boolean>; register(): Promise<void>; now?: () => number }) {
  let state: BackgroundRegistrationState = { phase: 'unregistered' };
  let inFlight: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let epoch = 0;
  let failures = 0;
  const listeners = new Set<() => void>();
  const publish = (next: BackgroundRegistrationState) => { state = Object.freeze(next); notifyListeners(listeners); };
  const cancelTimer = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const ensure = (): Promise<boolean> => {
    cancelTimer();
    if (inFlight) return inFlight;
    const lastAttemptAt = (deps.now ?? Date.now)();
    const attemptEpoch = epoch;
    publish({ phase: 'registering', lastAttemptAt });
    inFlight = (async () => {
      let error: NonNullable<BackgroundRegistrationState['error']> = 'BACKGROUND_QUERY_FAILED';
      try {
        const registered = await deps.isRegistered();
        if (attemptEpoch !== epoch) return false;
        if (!registered) { error = 'BACKGROUND_REGISTER_FAILED'; await deps.register(); }
        if (attemptEpoch !== epoch) return false;
        failures = 0;
        publish({ phase: 'registered', lastAttemptAt });
        return true;
      } catch {
        if (attemptEpoch === epoch) {
          publish({ phase: 'failed', error, lastAttemptAt });
          if (active && ++failures <= 3) timer = setTimeout(() => { timer = undefined; void ensure(); }, 1000 * 2 ** (failures - 1));
        }
        return false;
      } finally {
        inFlight = undefined;
        if (active && attemptEpoch !== epoch) timer = setTimeout(() => { timer = undefined; void ensure(); }, 0);
      }
    })();
    return inFlight;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ensure,
    resume() { active = true; failures = 0; cancelTimer(); void ensure(); },
    pause() { active = false; cancelTimer(); },
    stop() { active = false; epoch++; cancelTimer(); },
    retry() { failures = 0; cancelTimer(); return ensure(); },
  };
}
