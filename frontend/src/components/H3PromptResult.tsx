import React, { useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  SimpleImageAttachmentAdapter,
  ThreadPrimitive,
  useAuiState,
  useLocalRuntime,
} from "@assistant-ui/react";
import { Copy, Check, RotateCcw, ArrowUp, Square } from "lucide-react";
import type { AppSettings } from "../types";
import { createH3ChatModelAdapter } from "../agent/assistantAdapter";
import { loadThread, saveThread } from "../agent/threadStore";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface H3PromptResultProps {
  onApplyPrompt?: (prompt: string) => void;
  llmConfig: Pick<AppSettings, "llmApiKey" | "llmEndpoint" | "llmModel">;
}

const UserMessageComponent: React.FC = () => {
  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => <p className="whitespace-pre-wrap leading-relaxed">{text}</p>,
          }}
        />
      </div>
    </div>
  );
};

const AssistantMessageComponent: React.FC = () => {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2 mb-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white font-bold shadow-sm">
          AI
        </div>
        <span>Assistant</span>
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900/90 p-4 text-sm text-slate-200 shadow-md">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => <MarkdownRenderer content={text} />,
            tools: {
              Fallback: ({ toolName }) => (
                <div className="my-2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 font-mono text-xs text-slate-300">
                  <span className="inline-block animate-spin text-[11px]">⚙️</span>
                  <span>Tool: <code className="text-indigo-300">{toolName}</code></span>
                </div>
              ),
            },
          }}
        />
        <MessagePrimitive.Error>
          <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            ⚠️ 请求出错：请检查设置中的 LLM API Key、Endpoint 与 Model 是否填写正确。
          </div>
        </MessagePrimitive.Error>
      </div>
    </div>
  );
};

const MessageItem: React.FC = () => {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.If user>
        <UserMessageComponent />
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <AssistantMessageComponent />
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
};

function StandardThread({ savedThread }: { savedThread: ReturnType<typeof loadThread> }) {
  const messages = useAuiState((state) => state.thread.messages);
  const isRunning = useAuiState((state) => state.thread.isRunning);

  useEffect(() => {
    const threadId = savedThread?.threadId || "h3-prompt-assistant";
    saveThread({
      threadId,
      messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
    });
  }, [messages, savedThread?.threadId]);

  return (
    <ThreadPrimitive.Root className="flex h-[min(72vh,740px)] min-h-[500px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6" autoScroll>
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 text-2xl text-indigo-400 border border-indigo-500/30 shadow-inner">
              ✨
            </div>
            <h2 className="text-lg font-bold text-slate-100 mb-1">欢迎使用 Prompt 助手</h2>
            <p className="text-xs text-slate-400 max-w-sm mb-6">
              在下方输入您的创作想法或场景描述，AI 将自主调用官方技能库为您撰写和优化视频生成提示词。
            </p>
          </div>
        )}
        <ThreadPrimitive.Messages
          components={{
            Message: MessageItem,
          }}
        />
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="border-t border-slate-800/80 bg-slate-900/90 p-3">
        <div className="relative flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 focus-within:border-indigo-500 transition-colors">
          <ComposerPrimitive.Input
            className="max-h-32 min-h-12 flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none leading-relaxed"
            placeholder="输入消息，按 Enter 发送..."
            submitMode="enter"
          />
          <div className="flex items-center gap-1">
            {isRunning ? (
              <ComposerPrimitive.Cancel className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors">
                <Square className="h-3.5 w-3.5 fill-current" />
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ArrowUp className="h-4 w-4" />
              </ComposerPrimitive.Send>
            )}
          </div>
        </div>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

export function H3PromptResult({ llmConfig }: H3PromptResultProps) {
  const savedThread = useMemo(() => loadThread(), []);
  const adapter = useMemo(() => createH3ChatModelAdapter({
    apiKey: llmConfig.llmApiKey || "",
    endpoint: llmConfig.llmEndpoint || "",
    model: llmConfig.llmModel || "",
  }), [llmConfig.llmApiKey, llmConfig.llmEndpoint, llmConfig.llmModel]);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: savedThread?.messages,
    adapters: { attachments: new SimpleImageAttachmentAdapter() },
  });

  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!llmConfig.llmApiKey || !llmConfig.llmEndpoint || !llmConfig.llmModel) {
      setRuntimeError("请先在设置中填写 OpenAI-compatible API Key、Endpoint 和 Model");
    } else {
      setRuntimeError(null);
    }
  }, [llmConfig.llmApiKey, llmConfig.llmEndpoint, llmConfig.llmModel]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {runtimeError && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {runtimeError}
        </div>
      )}
      <StandardThread savedThread={savedThread} />
    </AssistantRuntimeProvider>
  );
}
