export type PromptRunTool = {
  id: string; name: string; status: 'running' | 'complete' | 'failed' | 'cancelled';
  startedAt: number; endedAt?: number; summary?: string;
};
export type PromptRun = {
  id: string; userMessageId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  startedAt: number; endedAt?: number; error?: string; retryOf?: string;
  messageIds: string[]; tools: PromptRunTool[];
};

export function readPromptRuns(state: unknown): PromptRun[] {
  const value = (state as { h3Runs?: unknown } | null)?.h3Runs;
  if (!Array.isArray(value)) return [];
  return value.filter((run): run is PromptRun => run && typeof run.id === 'string'
    && typeof run.userMessageId === 'string' && typeof run.startedAt === 'number'
    && ['running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)
    && Array.isArray(run.messageIds) && Array.isArray(run.tools));
}

export function endPromptRun(run: PromptRun, status: PromptRun['status'], now: number, error?: string): PromptRun {
  if (run.status !== 'running') return run;
  return { ...run, status, endedAt: now, ...(error ? { error } : {}), tools: run.tools.map(tool => tool.status === 'running'
    ? { ...tool, status: status === 'failed' ? 'failed' : 'cancelled', endedAt: now } : tool) };
}

export function reducePromptRunEvent(run: PromptRun, event: Record<string, any>, now: number): PromptRun {
  if (run.status !== 'running') return run;
  const messageId = event.messageId ?? event.parentMessageId;
  let next = messageId && !run.messageIds.includes(messageId)
    ? { ...run, messageIds: [...run.messageIds, messageId] } : run;
  if (event.type === 'TOOL_CALL_START' && !next.tools.some(tool => tool.id === event.toolCallId)) {
    next = { ...next, tools: [...next.tools, { id: event.toolCallId, name: event.toolCallName, status: 'running', startedAt: now }] };
  }
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
