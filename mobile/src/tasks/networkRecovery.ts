import type { SyncRequest } from './syncPolicy';

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
  expediteRetryableNetwork(jobIds: string[], now: number): number;
  runPoll(request: SyncRequest): Promise<unknown>;
  now(): number;
}) {
  const activeJobIds = await deps.listActiveJobIds();
  const expedited = deps.expediteRetryableNetwork(activeJobIds, deps.now());
  const polled = expedited > 0 || activeJobIds.length > 0;
  if (polled) await deps.runPoll({ reason: 'foreground', mode: 'poll', taskIds: activeJobIds });
  return { activeJobIds, expedited, polled };
}
