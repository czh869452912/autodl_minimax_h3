import type { WorkflowDefinition } from '../schema/types';
import { createWorkflowRegistryService } from './service';
import type { WorkflowRegistry, RegistryRecord } from './types';

export function createWorkflowCatalog(deps: { registry: WorkflowRegistry; builtins: WorkflowDefinition[]; adapters: Array<{ id: string; operations: string[] }>; appVersion: string; adapterVersions?: Record<string, string> }) {
  const service = createWorkflowRegistryService({ repository: deps.registry, adapters: deps.adapters, appVersion: deps.appVersion, adapterVersions: deps.adapterVersions });
  return {
    async bootstrap(): Promise<void> {
      for (const definition of deps.builtins) {
        const active = await deps.registry.getActive(definition.id);
        if (!active) await service.activateBuiltin(definition);
      }
    },
    async listActive(): Promise<RegistryRecord[]> { return service.discoverWorkflows(); },
    async getActive(workflowId: string): Promise<RegistryRecord | undefined> { return deps.registry.getActive(workflowId); },
    async rollback(workflowId: string): Promise<void> { await deps.registry.rollback(workflowId); },
    async activate(workflowId: string, version: string): Promise<void> { const record = await deps.registry.get(workflowId, version); if (!record) throw new Error('workflow version not found'); await deps.registry.setActive(workflowId, version, record.contentHash); },
  };
}
