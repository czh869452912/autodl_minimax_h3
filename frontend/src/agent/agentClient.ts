import { streamH3Graph } from '../../server/graph/h3Graph';
import { discoverH3Skill } from '../../server/skills/manifest';

export type AgentEventType =
  | 'skill-discovered'
  | 'draft'
  | 'validation'
  | 'evaluation'
  | 'refinement'
  | 'final'
  | 'error';

export interface AgentStreamEvent {
  type: AgentEventType | string;
  data: Record<string, any>;
}

function getCandidateEndpoints(): string[] {
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:' || !window.location.host) {
      return ['http://127.0.0.1:8787/api/agent/run', 'http://localhost:8787/api/agent/run'];
    }
  }
  return ['/api/agent/run', 'http://127.0.0.1:8787/api/agent/run', 'http://localhost:8787/api/agent/run'];
}

export async function runAgentStream(
  prompt: string,
  images: string[] = [],
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const endpoints = getCandidateEndpoints();

  // 1. Try server SSE endpoint first if available
  for (const endpoint of endpoints) {
    if (signal?.aborted) {
      onEvent({ type: 'error', data: { message: '任务已被用户手动取消' } });
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, images }),
        signal
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            if (!frame.trim()) continue;
            const match = frame.match(/^event:\s*(.+)\ndata:\s*(.+)$/s);
            if (match) {
              const type = match[1].trim();
              try {
                const data = JSON.parse(match[2]);
                onEvent({ type, data });
              } catch (e) {
                console.error('Failed to parse SSE JSON payload:', e, match[2]);
              }
            }
          }
        }
        return;
      }
    } catch {
      // Backend not running on this endpoint, fallback to in-app LangGraph engine
    }
  }

  // 2. Direct In-App LangGraph State Machine Execution (Zero-failure guarantee across dev, APK and static web)
  if (signal?.aborted) {
    onEvent({ type: 'error', data: { message: '任务已被用户手动取消' } });
    return;
  }

  try {
    const imgCount = images.length;
    const discoveredSkill = discoverH3Skill(imgCount);
    let result: Record<string, any> = {};

    for await (const update of streamH3Graph(prompt, imgCount)) {
      if (signal?.aborted) {
        onEvent({ type: 'error', data: { message: '任务已被用户手动取消' } });
        return;
      }

      const [node, state] = Object.entries(update)[0] || [];
      if (!state) continue;
      result = { ...result, ...(state as Record<string, unknown>) };

      if (node === 'discover') {
        onEvent({
          type: 'skill-discovered',
          data: {
            skill: result.skill || discoveredSkill.name,
            description: discoveredSkill.description,
            imageCount: imgCount
          }
        });
      }
      if (node === 'generateDraft') {
        onEvent({
          type: 'draft',
          data: { draft: result.draft }
        });
      }
      if (node === 'validateDraft') {
        onEvent({
          type: 'validation',
          data: {
            errors: result.validationErrors || [],
            valid: (result.validationErrors || []).length === 0
          }
        });
      }
      if (node === 'evaluateDraft') {
        onEvent({
          type: 'evaluation',
          data: {
            result: result.evaluation,
            iteration: result.iteration || 0
          }
        });
      }
      if (node === 'refineDraft') {
        onEvent({
          type: 'refinement',
          data: {
            draft: result.draft,
            iteration: result.iteration
          }
        });
      }
      if (node === 'finalizePrompt') {
        onEvent({
          type: 'final',
          data: { prompt: result.finalPrompt }
        });
      }
    }
  } catch (localErr: any) {
    onEvent({
      type: 'error',
      data: { message: `LangGraph 状态图推演异常: ${localErr.message || String(localErr)}` }
    });
  }
}




