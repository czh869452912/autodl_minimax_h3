import type { WorkflowDefinition } from '../schema/types';
import { packageToDefinition, parseWorkflowPackage } from '../schema/package';
import { createWorkflowRegistryService } from './service';
import type { WorkflowRegistry, RegistryRecord } from './types';
import { compareVersions } from './semver';

export function registryRecordToDefinition(record: RegistryRecord): WorkflowDefinition {
  const raw: unknown = JSON.parse(record.definitionJson);
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { apiVersion?: unknown }).apiVersion === 'workflow.autodl/v1') {
    return packageToDefinition(parseWorkflowPackage(raw));
  }
  return raw as WorkflowDefinition;
}

export function createWorkflowCatalog(deps: { registry: WorkflowRegistry; builtins: WorkflowDefinition[]; adapters: Array<{ id: string; operations: string[] }>; appVersion: string; adapterVersions?: Record<string, string> }) {
  const service = createWorkflowRegistryService({ repository: deps.registry, adapters: deps.adapters, appVersion: deps.appVersion, adapterVersions: deps.adapterVersions });
  return {
    async bootstrap(): Promise<void> {
      const grouped = new Map<string, WorkflowDefinition[]>();
      for (const definition of deps.builtins) {
        await service.installBuiltin(definition);
        const versions = grouped.get(definition.id) ?? [];
        versions.push(definition);
        grouped.set(definition.id, versions);
      }
      for (const [workflowId, definitions] of grouped) {
        const newest = [...definitions].sort((a, b) => compareVersions(b.version, a.version))[0];
        const active = await deps.registry.getActive(workflowId);
        if (!active || (active.source === 'builtin' && compareVersions(active.version, newest.version) < 0)) {
          const record = await deps.registry.get(workflowId, newest.version);
          if (!record) throw new Error('installed builtin workflow version not found');
          await deps.registry.setActive(workflowId, record.version, record.contentHash);
        }
      }
    },
    async listActive(): Promise<RegistryRecord[]> { return service.discoverWorkflows(); },
    async getActive(workflowId: string): Promise<RegistryRecord | undefined> { return deps.registry.getActive(workflowId); },
    async rollback(workflowId: string): Promise<void> { await deps.registry.rollback(workflowId); },
    async activate(workflowId: string, version: string): Promise<void> { const record = await deps.registry.get(workflowId, version); if (!record) throw new Error('workflow version not found'); await deps.registry.setActive(workflowId, version, record.contentHash); },
  };
}
