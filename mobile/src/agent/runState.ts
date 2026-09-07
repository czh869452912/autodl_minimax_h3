export type PromptRunTool = {
  id: string; name: string; status: 'running' | 'complete' | 'failed' | 'cancelled';
  startedAt: number; endedAt?: number; summary?: string;
  parentMessageId?: string; arguments?: string; output?: string;
};
export type RunActivity = { id: string; kind: 'reasoning' | 'text' | 'tool'; messageId: string; text?: string };
export type PromptRun = {
  id: string; userMessageId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  startedAt: number; endedAt?: number; error?: string; retryOf?: string;
  messageIds: string[]; tools: PromptRunTool[];
  baseWorkspaceRevision?: number;
  activities?: RunActivity[];
};

export function readPromptRuns(state: unknown): PromptRun[] {
  const value = (state as { h3Runs?: unknown } | null)?.h3Runs;
  if (!Array.isArray(value)) return [];
  return value.filter((run): run is PromptRun => run && typeof run.id === 'string'
    && typeof run.userMessageId === 'string' && typeof run.startedAt === 'number'
    && ['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)
    && Array.isArray(run.messageIds) && Array.isArray(run.tools));
}

export function endPromptRun(run: PromptRun, status: PromptRun['status'], now: number, error?: string): PromptRun {
  if (run.status !== 'running' && run.status !== 'queued') return run;
  return { ...run, status, endedAt: now, ...(error ? { error } : {}), tools: run.tools.map(tool => tool.status === 'running'
    ? { ...tool, status: status === 'failed' ? 'failed' : 'cancelled', endedAt: now } : tool) };
}

export function reducePromptRunEvent(run: PromptRun, event: Record<string, any>, now: number): PromptRun {
  if (run.status === 'queued' && event.type === 'RUN_STARTED') return { ...run, status: 'running' };
  if (run.status !== 'running') return run;
  const messageId = event.messageId ?? event.parentMessageId ?? (event.name === 'h3.reasoning' ? event.value?.messageId : undefined);
  let next = messageId && !run.messageIds.includes(messageId)
    ? { ...run, messageIds: [...run.messageIds, messageId] } : run;
  const reasoning = event.type === 'CUSTOM' && event.name === 'h3.reasoning';
  if (reasoning || event.type === 'TEXT_MESSAGE_CONTENT') {
    const kind = reasoning ? 'reasoning' : 'text';
    const delta = reasoning ? event.value?.delta : event.delta;
    if (typeof messageId === 'string' && typeof delta === 'string' && delta) {
      const id = `${kind}:${messageId}`;
      const activities = next.activities ?? [];
      next = { ...next, activities: activities.some(item => item.id === id)
        ? activities.map(item => item.id === id && reasoning ? { ...item, text: (item.text ?? '') + delta } : item)
        : [...activities, { id, kind, messageId, ...(reasoning ? { text: delta } : {}) }] };
    }
  }
  if (event.type === 'TOOL_CALL_START' && !next.tools.some(tool => tool.id === event.toolCallId)) {
    next = { ...next, activities: [...(next.activities ?? []), { id: event.toolCallId, kind: 'tool', messageId: event.parentMessageId }], tools: [...next.tools, { id: event.toolCallId, name: event.toolCallName, parentMessageId: event.parentMessageId, status: 'running', startedAt: now }] };
  }
  if (event.type === 'TOOL_CALL_ARGS') next = { ...next, tools: next.tools.map(tool => tool.id === event.toolCallId ? { ...tool, arguments: (tool.arguments ?? '') + event.delta } : tool) };
  if (event.type === 'TOOL_CALL_RESULT') next = { ...next, tools: next.tools.map(tool => tool.id === event.toolCallId ? { ...tool, output: event.content } : tool) };
  if (event.type === 'CUSTOM' && event.name === 'h3.tool.status') {
    const value = event.value ?? {};
    if (value.status === 'complete' || value.status === 'failed') next = { ...next, tools: next.tools.map(tool => tool.id === value.toolCallId
      ? { ...tool, status: value.status, endedAt: now, summary: value.summary } : tool) };
  }
  if (event.type === 'RUN_ERROR') return endPromptRun(next, 'failed', now, event.message);
  if (event.type === 'CUSTOM' && event.name === 'h3.run.cancelled') return endPromptRun(next, 'cancelled', now);
  if (event.type === 'RUN_FINISHED') return endPromptRun(next, event.outcome?.type === 'interrupt' ? 'interrupted' : 'completed', now);
  return next;
}
