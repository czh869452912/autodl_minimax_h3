export const H3_EVENTS = {
  reasoning: 'h3.reasoning', workspace: 'h3.workspace', toolStatus: 'h3.tool.status', cancelled: 'h3.run.cancelled',
} as const;
export const H3_CLIENT_KEYS = ['h3Composer', 'h3Versions', 'h3SelectedVersionId', 'h3ReadAt', 'h3Workspace', 'h3Workspaces'] as const;
export type WorkspaceSnapshot = Record<string, unknown> & { revision: number };
export type H3CustomEvent =
  | { type: 'CUSTOM'; name: typeof H3_EVENTS.reasoning; value: { messageId: string; delta: string } }
  | { type: 'CUSTOM'; name: typeof H3_EVENTS.toolStatus; value: { toolCallId: string; status: 'complete' | 'failed'; summary?: string } }
  | { type: 'CUSTOM'; name: typeof H3_EVENTS.cancelled; value: { runId: string } }
  | { type: 'CUSTOM'; name: typeof H3_EVENTS.workspace; value: { runId: string; workspace: WorkspaceSnapshot } };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function workspaceRevision(value: unknown): number | undefined {
  return record(value) && typeof value.revision === 'number' && Number.isFinite(value.revision) ? value.revision : undefined;
}
// Validate only the envelope consumed here; preserve extra workspace/persisted
// fields for compatibility. Unknown custom events do not terminate an active run.
export function decodeH3CustomEvent(event: unknown): H3CustomEvent | undefined {
  if (!record(event) || event.type !== 'CUSTOM' || !record(event.value)) return undefined;
  const value = event.value;
  switch (event.name) {
    case H3_EVENTS.reasoning:
      if (typeof value.messageId === 'string' && typeof value.delta === 'string') return { type: 'CUSTOM', name: event.name, value: { messageId: value.messageId, delta: value.delta } };
      break;
    case H3_EVENTS.toolStatus:
      if (typeof value.toolCallId === 'string' && (value.status === 'complete' || value.status === 'failed') && (value.summary === undefined || typeof value.summary === 'string')) return { type: 'CUSTOM', name: event.name, value: { toolCallId: value.toolCallId, status: value.status, summary: value.summary } };
      break;
    case H3_EVENTS.cancelled:
      if (typeof value.runId === 'string') return { type: 'CUSTOM', name: event.name, value: { runId: value.runId } };
      break;
    case H3_EVENTS.workspace:
      if (typeof value.runId === 'string' && workspaceRevision(value.workspace) !== undefined) return { type: 'CUSTOM', name: event.name, value: { runId: value.runId, workspace: value.workspace as WorkspaceSnapshot } };
  }
  return undefined;
}
