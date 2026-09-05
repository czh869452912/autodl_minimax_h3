import type { OperationRepository } from './operationRepository';
import type { OperationKind, WorkflowOperation } from './types';

export type TickSummary = {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  blocked: number;
  remainingDue: number;
  remainingScheduled: number;
  nextWakeAt?: number;
};
export type TickOptions = { reason: 'foreground' | 'background' | 'service'; maxOperations?: number; now?: number };

const laneOrder: OperationKind[] = ['SUBMIT', 'STATUS_SYNC', 'ARTIFACT_DOWNLOAD', 'EXPORT'];
const concurrency: Record<OperationKind, number> = { SUBMIT: 1, STATUS_SYNC: 4, ARTIFACT_DOWNLOAD: 1, EXPORT: 1 };

async function waitForAll(work: Promise<void>[]): Promise<void> {
  // Keep the scheduler lease until all started work settles, even on failure.
  const results = await Promise.allSettled(work);
  const rejected = results.find(result => result.status === 'rejected');
  if (rejected) throw rejected.reason;
}

type TickDeps = {
  operations: OperationRepository;
  executor: { recover(now: number): Promise<void>; handle(operation: WorkflowOperation, owner: string): Promise<void> };
  owner(): string;
  isReadonly(): boolean | Promise<boolean>;
  leaseMs?: number;
};

async function dueSnapshot(operations: OperationRepository, now: number, maxOperations: number): Promise<WorkflowOperation[]> {
  const byKind = new Map<OperationKind, WorkflowOperation[]>(laneOrder.map((kind) => [kind, []]));
  for (const operation of await operations.listDueSnapshot({ now, perLaneLimit: maxOperations })) {
    byKind.get(operation.kind)?.push(operation);
  }
  const snapshot: WorkflowOperation[] = [];
  while (snapshot.length < maxOperations) {
    let progressed = false;
    for (const kind of laneOrder) {
      const operation = byKind.get(kind)?.shift();
      if (!operation) continue;
      snapshot.push(operation);
      progressed = true;
      if (snapshot.length >= maxOperations) break;
    }
    if (!progressed) break;
  }
  return snapshot;
}

export function createExecutorTick(deps: TickDeps) {
  const runOnce = async (options: TickOptions): Promise<TickSummary> => {
    const timestamp = options.now ?? Date.now();
    const maxOperations = Math.max(1, Math.min(8, options.maxOperations ?? 8));
    const remaining = () => deps.operations.pendingSummary({ now: timestamp });
    const summary: TickSummary = {
      claimed: 0,
      succeeded: 0,
      retried: 0,
      failed: 0,
      blocked: 0,
      remainingDue: 0,
      remainingScheduled: 0,
    };
    if (await deps.isReadonly()) return { ...summary, ...(await remaining()) };
    await deps.executor.recover(timestamp);
    const snapshot = await dueSnapshot(deps.operations, timestamp, maxOperations);
    const owner = deps.owner();
    const runLane = async (items: WorkflowOperation[], limit: number) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const candidate = items[cursor++];
          const claimed = await deps.operations.claimById(candidate.id, owner, timestamp, deps.leaseMs ?? 120_000);
          if (!claimed) continue;
          summary.claimed += 1;
          try {
            await deps.executor.handle(claimed, owner);
          } catch {
            await deps.operations.release(claimed.id, owner, timestamp);
          }
          const current = await deps.operations.get(claimed.id);
          if (current?.state === 'CLAIMED') {
            await deps.operations.release(claimed.id, owner, timestamp);
            summary.retried += 1;
          } else if (current?.state === 'SUCCEEDED') summary.succeeded += 1;
          else if (current?.state === 'FAILED') summary.failed += 1;
          else if (current?.state === 'BLOCKED') summary.blocked += 1;
          else if (current?.state === 'PENDING') summary.retried += 1;
        }
      };
      await waitForAll(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    };
    await waitForAll(laneOrder.map((kind) => runLane(snapshot.filter((item) => item.kind === kind), concurrency[kind])));
    Object.assign(summary, await remaining());
    return summary;
  };
  return {
    run(options: TickOptions): Promise<TickSummary> {
      return runOnce(options);
    },
  };
}

export type ExecutorTick = ReturnType<typeof createExecutorTick>;
