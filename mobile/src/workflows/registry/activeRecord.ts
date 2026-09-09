import type { RegistryRecord, WorkflowRegistry } from './types';
import { RegistryReleaseError } from './releaseManifest';

// Production lookup never falls back from a corrupt active pointer.
export async function strictActiveRecord(registry: WorkflowRegistry, workflowId: string): Promise<RegistryRecord | undefined> {
  const pointer = await registry.getActivePointer(workflowId);
  if (!pointer) return undefined;
  const record = await registry.get(pointer.workflowId, pointer.version);
  if (!record || record.contentHash !== pointer.contentHash) {
    throw new RegistryReleaseError('REGISTRY_ACTIVE_POINTER_INVALID');
  }
  return record;
}
