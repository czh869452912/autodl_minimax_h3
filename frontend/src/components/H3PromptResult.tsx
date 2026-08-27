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
import type { AppSettings } from "../types";
import { createH3ChatModelAdapter } from "../agent/assistantAdapter";
import { loadThread, saveThread } from "../agent/threadStore";

interface H3PromptResultProps {
  onApplyPrompt: (prompt: string) => void;
  llmConfig: Pick<AppSettings, "llmApiKey" | "llmEndpoint" | "llmModel">;
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text || "");
    return "";
  }).join("");
}

function extractPrompt(messages: readonly { role?: string; content?: unknown }[]): string | null {
  const assistantText = [...messages]
    .reverse()
    .filter((message) => message.role === "assistant")
    .map((message) => getMessageText(message.content))
    .find((text) => text.includes("integrated_multimodal_description:"));
  if (!assistantText) return null;
  return assistantText.slice(assistantText.indexOf("integrated_multimodal_description:")).trim() || null;
}

function AgentThread({ onApplyPrompt, savedThread }: { onApplyPrompt: (prompt: string) => void; savedThread: ReturnType<typeof loadThread> }) {
  const messages = useAuiState((state) => state.thread.messages);
  const prompt = extractPrompt(messages);

  useEffect(() => {
    const threadId = savedThread?.threadId || "h3-prompt-assistant";
    saveThread({
      threadId,
      messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
      finalPrompt: prompt,
    });
  }, [messages, prompt, savedThread?.threadId]);

  return (
    <div className="space-y-4">
      <ThreadPrimitive.Root className="flex h-[min(68vh,720px)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-5" autoScroll>
          <ThreadPrimitive.Messages
            components={{
              Message: () => (
                <MessagePrimitive.Root className="mb-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-sm text-slate-200">
                  <MessagePrimitive.Parts />
                </MessagePrimitive.Root>
              ),
            }}
          />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="border-t border-slate-800 bg-slate-950/50 p-3">
          <ComposerPrimitive.Input
            className="min-h-20 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            placeholder="描述场景、镜头、声音或上传参考图…"
            submitMode="enter"
          />
          <div className="mt-2 flex justify-end gap-2">
            <ComposerPrimitive.Cancel className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-slate-500">
              停止
            </ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500">
              发送
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
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

export function H3PromptResult({ onApplyPrompt, llmConfig }: H3PromptResultProps) {
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
      {runtimeError && <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{runtimeError}</div>}
      <AgentThread onApplyPrompt={onApplyPrompt} savedThread={savedThread} />
    </AssistantRuntimeProvider>
  );
}
