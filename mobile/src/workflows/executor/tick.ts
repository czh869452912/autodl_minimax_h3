import type { OperationRepository } from './operationRepository';
import type { OperationKind, WorkflowOperation } from './types';

export type TickSummary = { claimed: number; succeeded: number; retried: number; failed: number; blocked: number; remainingDue: number };
export type TickOptions = { reason: 'foreground' | 'background' | 'service'; maxOperations?: number; now?: number };

const laneOrder: OperationKind[] = ['SUBMIT', 'STATUS_SYNC', 'ARTIFACT_DOWNLOAD', 'EXPORT'];
const concurrency: Record<OperationKind, number> = { SUBMIT: 1, STATUS_SYNC: 4, ARTIFACT_DOWNLOAD: 1, EXPORT: 1 };

type TickDeps = {
  operations: OperationRepository;
  executor: { recover(now: number): Promise<void>; handle(operation: WorkflowOperation, owner: string): Promise<void> };
  owner(): string;
  isReadonly(): boolean;
  leaseMs?: number;
};

function dueSnapshot(operations: OperationRepository, now: number, maxOperations: number): WorkflowOperation[] {
  const byKind = new Map<OperationKind, WorkflowOperation[]>();
  for (const kind of laneOrder) {
    byKind.set(kind, operations.list(kind)
      .filter((item) => item.state === 'PENDING' && item.nextRetryAt <= now && (item.leaseExpiresAt == null || item.leaseExpiresAt <= now))
      .sort((left, right) => left.nextRetryAt - right.nextRetryAt || left.createdAt - right.createdAt || left.id.localeCompare(right.id)));
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
  let inFlight: Promise<TickSummary> | undefined;
  const runOnce = async (options: TickOptions): Promise<TickSummary> => {
    const timestamp = options.now ?? Date.now();
    const maxOperations = Math.max(1, Math.min(32, options.maxOperations ?? 8));
    const remainingDue = () => deps.operations.list().filter((item) => item.state === 'PENDING' && item.nextRetryAt <= timestamp).length;
    const summary: TickSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0, blocked: 0, remainingDue: 0 };
    if (deps.isReadonly()) return { ...summary, remainingDue: remainingDue() };
    await deps.executor.recover(timestamp);
    const snapshot = dueSnapshot(deps.operations, timestamp, maxOperations);
    const owner = deps.owner();
    const runLane = async (items: WorkflowOperation[], limit: number) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const candidate = items[cursor++];
          const claimed = deps.operations.claimById(candidate.id, owner, timestamp, deps.leaseMs ?? 120_000);
          if (!claimed) continue;
          summary.claimed += 1;
          try {
            await deps.executor.handle(claimed, owner);
          } catch {
            deps.operations.release(claimed.id, owner, timestamp);
          }
          const current = deps.operations.get(claimed.id);
          if (current?.state === 'CLAIMED') {
            deps.operations.release(claimed.id, owner, timestamp);
            summary.retried += 1;
          } else if (current?.state === 'SUCCEEDED') summary.succeeded += 1;
          else if (current?.state === 'FAILED') summary.failed += 1;
          else if (current?.state === 'BLOCKED') summary.blocked += 1;
          else if (current?.state === 'PENDING') summary.retried += 1;
        }
      };
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    };
    await Promise.all(laneOrder.map((kind) => runLane(snapshot.filter((item) => item.kind === kind), concurrency[kind])));
    summary.remainingDue = remainingDue();
    return summary;
  };
  return {
    run(options: TickOptions): Promise<TickSummary> {
      if (!inFlight) inFlight = runOnce(options).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}

export type ExecutorTick = ReturnType<typeof createExecutorTick>;
