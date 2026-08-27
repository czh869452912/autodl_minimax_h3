import { nativeReadLlmConfig } from '../utils/nativeBridge';
import { runH3AgentHarness } from './h3AgentHarness';

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
  // 1. Try server-side agent endpoint first if running with backend
  try {
    const response = await fetch('/api/agent/run', {
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
          const event = frame.match(/^event:\s*(.+)\ndata:\s*(.+)$/s);
          if (event) onEvent({ type: event[1].trim(), data: JSON.parse(event[2]) });
        }
      }
      return;
    }
  } catch {
    // Server backend unavailable (e.g. native Android WebView APK mode). Fallback to in-app LLM harness.
  }

  // 2. Fallback: run directly in client using LLM config saved in App Settings
  const llmConfig = nativeReadLlmConfig();
  if (!llmConfig.apiKey) {
    onEvent({
      type: 'final',
      data: {
        prompt: `⚠️ 请先在“设置”页配置 LLM API Key (如 MiniMax / DeepSeek)，以便在单机模式下使用 Prompt 助手。\n\n原始输入：${prompt}`
      }
    });
    return;
  }

  onEvent({
    type: 'step',
    data: { name: 'Agent 本地推演中', detail: `调用 ${llmConfig.model || 'MiniMax'} 模型...` }
  });

  try {
    const result = await runH3AgentHarness({
      apiKey: llmConfig.apiKey,
      endpoint: llmConfig.endpoint,
      modelName: llmConfig.model,
      systemPrompt: 'You are an expert director and prompt engineer specializing in MiniMax H3 Neural Video Model. Break down the user idea into precise camera movements, timecode cuts, multimodal references, and soundscapes adhering to official syntax.',
      userPrompt: prompt,
      images,
      onStepProgress: (stepName, detail) => {
        onEvent({ type: 'step', data: { name: stepName, detail } });
      }
    });

    onEvent({
      type: 'final',
      data: { prompt: result }
    });
  } catch (err: any) {
    onEvent({
      type: 'final',
      data: { prompt: `❌ 调用 LLM 助手失败：${err.message || String(err)}` }
    });
  }
}

