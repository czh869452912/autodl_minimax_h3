import type { WorkflowDefinition } from '../schema/types';

export function createBuiltinDefinitions(definitions: WorkflowDefinition[] = []): WorkflowDefinition[] { return definitions.filter((definition) => definition.kind === 'atomic'); }
