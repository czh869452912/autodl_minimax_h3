import React, { useEffect, useMemo, useState } from 'react';
import {
  CopilotChat,
  CopilotKitProvider,
  UseAgentUpdate,
  useAgent,
} from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';

interface H3PromptResultProps {
  onApplyPrompt: (prompt: string) => void;
}

function getMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text || '');
      return '';
    }).join('');
  }
  return '';
}

function extractPrompt(messages: readonly { role?: string; content?: unknown }[]): string | null {
  const assistantText = [...messages]
    .reverse()
    .filter((message) => message.role === 'assistant')
    .map((message) => getMessageText(message.content))
    .find((text) => text.includes('integrated_multimodal_description:'));
  if (!assistantText) return null;

  const start = assistantText.indexOf('integrated_multimodal_description:');
  const prompt = assistantText.slice(start).trim();
  return prompt || null;
}

function AgentChat({ onApplyPrompt }: H3PromptResultProps) {
  const { agent } = useAgent({
    agentId: 'default',
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(extractPrompt(agent.messages));
  }, [agent.messages]);

  const threadId = useMemo(() => {
    const storageKey = 'h3-prompt-assistant-thread';
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(storageKey, next);
    return next;
  }, []);

  return (
    <div className="space-y-4">
      <div className="h-[min(68vh,720px)] min-h-[480px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl">
        <CopilotChat
          agentId="default"
          threadId={threadId}
          className="h-full"
          labels={{
            modalHeaderTitle: 'MiniMax H3 Prompt Assistant',
            welcomeMessageText: '描述你想生成的视频，我会自主选择官方 skill 并多轮迭代提示词。',
            chatInputPlaceholder: '描述场景、镜头、声音或上传参考图…',
          }}
          attachments={{
            enabled: true,
            accept: 'image/*',
            maxSize: 20 * 1024 * 1024,
            onUpload: async (file) => ({
              type: 'data',
              value: `data:${file.type};base64,${btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())))}`,
              mimeType: file.type,
            }),
          }}
        />
      </div>
      {prompt && (
        <section className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-indigo-100">最终 H3 Prompt</h2>
            <button
              type="button"
              onClick={() => onApplyPrompt(prompt)}
              className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-400"
            >
              应用到生成器
            </button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-200">{prompt}</pre>
        </section>
      )}
    </div>
  );
}

export function H3PromptResult({ onApplyPrompt }: H3PromptResultProps) {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      <AgentChat onApplyPrompt={onApplyPrompt} />
    </CopilotKitProvider>
  );
}
