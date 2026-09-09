import type { OperationRepository } from '../workflows/executor/operationRepository';
import type { OperationKind, WorkflowOperation } from '../workflows/executor/types';

// Test setup follows the same snapshot + fenced claim path as executor/tick.
export async function claimOperations(repository: OperationRepository, options: { kind: OperationKind; owner: string; now: number; leaseMs: number; limit: number }): Promise<WorkflowOperation[]> {
  const candidates = await repository.listDueSnapshot({ now: options.now, perLaneLimit: options.limit });
  const result: WorkflowOperation[] = [];
  for (const candidate of candidates.filter(item => item.kind === options.kind)) {
    const claimed = await repository.claimById(candidate.id, options.owner, options.now, options.leaseMs);
    if (claimed) result.push(claimed);
  }
  return result;
}
