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

import { MarkdownRenderer } from "./MarkdownRenderer";

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

const CustomMessage: React.FC = () => {
  return (
    <MessagePrimitive.Root className="mb-5">
      <MessagePrimitive.If user>
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-md">
            <MessagePrimitive.Parts
              components={{
                Text: ({ text }) => <p className="whitespace-pre-wrap leading-relaxed">{text}</p>,
              }}
            />
          </div>
        </div>
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[11px]">✨</span>
            <span>H3 Prompt 助手</span>
          </div>
          <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200 shadow-xl">
            <MessagePrimitive.Parts
              components={{
                Text: ({ text }) => <MarkdownRenderer content={text} />,
                tools: {
                  Fallback: ({ toolName }) => (
                    <div className="my-2 flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-950/40 px-3 py-1.5 font-mono text-xs text-indigo-300">
                      <span className="inline-block animate-spin text-[11px]">⚙️</span>
                      <span>正在检索/阅读技能: <code className="text-indigo-200">{toolName}</code></span>
                    </div>
                  ),
                },
              }}
            />
            <MessagePrimitive.Error>
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                ⚠️ 请求失败：请检查设置中的 LLM API Key、Endpoint 与 Model 是否填写正确，以及网络连接是否通畅。
              </div>
            </MessagePrimitive.Error>
          </div>
        </div>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
};

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
              Message: CustomMessage,
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
