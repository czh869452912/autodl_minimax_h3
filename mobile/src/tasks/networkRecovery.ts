import type { ExecutorTrigger } from './executorEvents';

export function createConnectivityEdgeDetector() {
  let previous: boolean | undefined;
  return {
    observe(connected: boolean | undefined): boolean {
      if (connected === undefined) return false;
      const recovered = previous === false && connected === true;
      previous = connected;
      return recovered;
    },
  };
}

export async function resumeAfterConnectivityReturns(deps: {
  listActiveJobIds(): Promise<string[]>;
  expediteRetryableNetwork(jobIds: string[], now: number): Promise<number>;
  signal(trigger: ExecutorTrigger): void;
  now(): number;
}) {
  const activeJobIds = await deps.listActiveJobIds();
  const expedited = await deps.expediteRetryableNetwork(activeJobIds, deps.now());
  const signaled = expedited > 0 || activeJobIds.length > 0;
  if (signaled) deps.signal('connectivity');
  return { activeJobIds, expedited, signaled };
}
