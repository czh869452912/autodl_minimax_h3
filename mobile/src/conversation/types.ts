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

export type ProcessEntry = { id: string; kind: 'text' | 'reasoning'; text: string } | { id: string; kind: 'tool'; tool: PromptRunTool };
