import type { WorkflowDefinition } from '../schema/types';
import { packageToDefinition, parseWorkflowPackage } from '../schema/package';
import type { WorkflowRegistry, RegistryRecord } from './types';
import { RegistryReleaseError, type BuiltinWorkflowReleaseSet } from './releaseManifest';
import type { WorkflowReleaseCoordinator } from './releaseCoordinator';

export function registryRecordToDefinition(record: RegistryRecord): WorkflowDefinition {
  const raw: unknown = JSON.parse(record.definitionJson);
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { apiVersion?: unknown }).apiVersion === 'workflow.autodl/v1') {
    return packageToDefinition(parseWorkflowPackage(raw));
  }
  return raw as WorkflowDefinition;
}

async function strictActiveRecord(
  registry: WorkflowRegistry,
  workflowId: string,
): Promise<RegistryRecord | undefined> {
  const pointer = await registry.getActivePointer(workflowId);
  if (!pointer) return undefined;
  const record = await registry.get(pointer.workflowId, pointer.version);
  if (!record || record.contentHash !== pointer.contentHash) {
    throw new RegistryReleaseError('REGISTRY_ACTIVE_POINTER_INVALID');
  }
  return record;
}

export function createWorkflowCatalog(deps: {
  registry: WorkflowRegistry;
  coordinator: WorkflowReleaseCoordinator;
  releaseSet: BuiltinWorkflowReleaseSet;
}) {
  return {
    async bootstrap() {
      return deps.coordinator.reconcile(deps.releaseSet);
    },
    async listActive(): Promise<RegistryRecord[]> {
      const workflowIds = [...new Set((await deps.registry.list()).map((record) => record.workflowId))].sort();
      const records = await Promise.all(
        workflowIds.map((workflowId) => strictActiveRecord(deps.registry, workflowId)),
      );
      return records.filter((record): record is RegistryRecord => Boolean(record));
    },
    async getActive(workflowId: string): Promise<RegistryRecord | undefined> {
      return strictActiveRecord(deps.registry, workflowId);
    },
    async rollback(workflowId: string): Promise<void> {
      await deps.registry.rollback(workflowId);
    },
    async activate(workflowId: string, version: string): Promise<void> {
      const record = await deps.registry.get(workflowId, version);
      if (!record) throw new Error('workflow version not found');
      await deps.registry.setActive(workflowId, version, record.contentHash);
    },
  };
}
