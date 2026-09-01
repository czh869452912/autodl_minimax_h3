import h3Definition from '../definitions/autodl/minimax-h3-i2v-15s.json';
import type { WorkflowDefinition } from '../schema/types';
import { createWorkflowRegistry } from './repository';
import { createWorkflowCatalog } from './catalog';
import { getDatabase } from '../../storage/databaseClient';

export const builtinWorkflowDefinitions: WorkflowDefinition[] = [h3Definition as WorkflowDefinition];
export function createAppWorkflowCatalog() {
  const registry = createWorkflowRegistry(getDatabase());
  return createWorkflowCatalog({ registry, builtins: builtinWorkflowDefinitions, adapters: [{ id: 'autodl-comfyui', operations: ['workflow.submit'] }], appVersion: '1.4.0', adapterVersions: { 'autodl-comfyui': '1.0.0' } });
}
