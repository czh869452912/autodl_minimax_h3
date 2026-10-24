import definition from '../workflows/definitions/autodl/minimax-h3-i2v-15s.json';
import { H3_WORKFLOW_ID } from '../workflows/providers/autodl/metadata';

export const H3_CREATIVE_WORKFLOW_ID = definition.id;
// Older drafts stored the remote endpoint ID instead of the local catalog ID.
export const creativeVideoWorkflowId = (id: string) => id === H3_WORKFLOW_ID ? H3_CREATIVE_WORKFLOW_ID : id;
