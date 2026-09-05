import type { TickOptions, TickSummary } from './tick';

export type CycleOptions = TickOptions & {
  maxPasses?: number;
  maxOperationsTotal?: number;
};

export type CycleSummary = TickSummary & {
  passes: number;
  budgetExhausted: boolean;
};

type CycleDeps = {
  runTick(options: TickOptions): Promise<TickSummary>;
  now?: () => number;
};

function emptySummary(): CycleSummary {
  return {
    claimed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    blocked: 0,
    remainingDue: 0,
    remainingScheduled: 0,
    passes: 0,
    budgetExhausted: false,
  };
}

export function createExecutorCycle(deps: CycleDeps) {
  let inFlight: Promise<CycleSummary> | undefined;

  const runOnce = async (options: CycleOptions): Promise<CycleSummary> => {
    const maxPasses = Math.max(1, Math.min(16, options.maxPasses ?? 4));
    const maxOperationsTotal = Math.max(1, Math.min(32, options.maxOperationsTotal ?? 32));
    const result = emptySummary();
    let startedAt: number | undefined;
    let timeExhausted = false;

    while (result.passes < maxPasses && result.claimed < maxOperationsTotal) {
      const observedNow = deps.now?.() ?? Date.now();
      const timestamp = options.now ?? observedNow;
      if (startedAt == null) startedAt = observedNow;
      else if (observedNow - startedAt >= 2_000) {
        timeExhausted = true;
        break;
      }
      const remainingOperationBudget = maxOperationsTotal - result.claimed;
      const pass = await deps.runTick({
        reason: options.reason,
        maxOperations: remainingOperationBudget,
        now: timestamp,
      });
      result.passes += 1;
      result.claimed += Math.min(pass.claimed, remainingOperationBudget);
      result.succeeded += pass.succeeded;
      result.retried += pass.retried;
      result.failed += pass.failed;
      result.blocked += pass.blocked;
      result.remainingDue = pass.remainingDue;
      result.remainingScheduled = pass.remainingScheduled;
      result.nextWakeAt = pass.nextWakeAt;

      if (
        pass.claimed === 0
        || (pass.remainingDue === 0 && pass.remainingScheduled === 0)
      ) break;
    }

    result.budgetExhausted = result.remainingDue > 0
      && (result.passes >= maxPasses || result.claimed >= maxOperationsTotal || timeExhausted);
    return result;
  };

  return {
    run(options: CycleOptions): Promise<CycleSummary> {
      if (!inFlight) inFlight = runOnce(options).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}

export type ExecutorCycle = ReturnType<typeof createExecutorCycle>;
