import React, { useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter
} from '@assistant-ui/react';
import { runAgentStream } from '../agent/agentClient';

interface AssistantChatSurfaceProps { onApplyPrompt: (prompt: string) => void; }

export function AssistantChatSurface({ onApplyPrompt }: AssistantChatSurfaceProps) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async *run({ messages, abortSignal }) {
      const last = messages.at(-1);
      const prompt = last?.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map((part) => part.text).join('') || '';
      let output = '';
      yield { content: [{ type: 'text', text: '正在连接 LangGraph agent...' }] };
      await runAgentStream(prompt, [], (event) => { if (event.type === 'final') output = String(event.data.prompt || ''); }, abortSignal);
      yield { content: [{ type: 'text', text: output || 'Agent 未返回最终 prompt。' }] };
    }
  }), []);
  const runtime = useLocalRuntime(adapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-[520px] flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto">
          <ThreadPrimitive.Messages components={{ Message: () => (
            <MessagePrimitive.Root className="mb-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-200">
              <MessagePrimitive.Content />
              <button type="button" onClick={() => { const text = document.getSelection()?.toString(); if (text) onApplyPrompt(text); }} className="mt-3 text-xs text-indigo-300 hover:text-indigo-200">应用选中文本到生成页</button>
            </MessagePrimitive.Root>
          ) }} />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="flex gap-2 border-t border-slate-800 pt-3">
          <ComposerPrimitive.Input className="min-h-12 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500" placeholder="描述你的想法..." />
          <ComposerPrimitive.Send className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">发送</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
