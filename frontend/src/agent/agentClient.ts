export interface AgentStreamEvent {
  type: string;
  data: Record<string, unknown>;
}

export async function runAgentStream(
  prompt: string,
  images: string[],
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, images }),
    signal
  });
  if (!response.ok || !response.body) throw new Error(`Agent backend HTTP ${response.status}`);
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
      const event = frame.match(/^event:\s*(.+)\ndata:\s*(.+)$/s);
      if (event) onEvent({ type: event[1].trim(), data: JSON.parse(event[2]) });
    }
  }
}
