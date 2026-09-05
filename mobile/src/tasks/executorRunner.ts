import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExecutorTrigger } from './executorEvents';
import type { ExecutorWakeRepository } from './executorWakeRepository';
import { withAsyncSchedulerLease } from './scheduler';
import { claimMaintenanceWindowAsync } from './syncPolicy';

export type WorkerRequest = Readonly<{ trigger: ExecutorTrigger; taskIds?: readonly string[] }>;
export type WorkerResult = Readonly<{ capturedGeneration: number; handledGeneration: number; remainingDue: number; remainingScheduled: number; nextWakeAt?: number; budgetExhausted: boolean }>;
export type ExecutorRunner = { runSlice(request: WorkerRequest): Promise<WorkerResult> };

export function createExecutorRunner(deps: {
  db: SQLiteDatabase;
  wakes: ExecutorWakeRepository;
  now?: () => number;
  runCycle(request: WorkerRequest): Promise<{ budgetExhausted: boolean }>;
  pendingSummary(request: WorkerRequest): Promise<{ remainingDue: number; remainingScheduled: number; nextWakeAt?: number }>;
  maintain(): Promise<unknown>;
}): ExecutorRunner {
  const now = deps.now ?? Date.now;
  return { async runSlice(request) {
    const result = await withAsyncSchedulerLease('task-executor', async lease => {
      const captured = await deps.wakes.read();
      const cycle = await deps.runCycle(request);
      await lease.assertOwned();
      const forceMaintenance = captured.maintenanceGeneration > captured.handledGeneration && captured.maintenanceGeneration <= captured.generation;
      if (await claimMaintenanceWindowAsync(deps.db, now(), forceMaintenance)) {
        await deps.maintain();
      }
      await lease.assertOwned();
      await deps.wakes.acknowledge(captured.generation);
      const [state, pending] = await Promise.all([deps.wakes.read(), deps.pendingSummary(request)]);
      const trailing = state.generation > state.handledGeneration;
      return { ...pending, capturedGeneration: captured.generation, handledGeneration: state.handledGeneration,
        budgetExhausted: cycle.budgetExhausted,
        ...(trailing ? { nextWakeAt: Math.min(pending.nextWakeAt ?? Infinity, now() + 1000) } : {}),
      };
    }, { db: deps.db, now });
    if (result) return result;
    const [state, pending] = await Promise.all([deps.wakes.read(), deps.pendingSummary(request)]);
    return { ...pending, capturedGeneration: state.generation, handledGeneration: state.handledGeneration,
      nextWakeAt: now() + 1000, budgetExhausted: false };
  } };
}
