export interface AgentRunRequest {
  prompt: string;
  images?: string[];
  threadId?: string;
}

export interface AgentRunEvent {
  type: 'skill-discovered' | 'draft' | 'validation' | 'evaluation' | 'refinement' | 'final' | 'error';
  data: Record<string, unknown>;
}
