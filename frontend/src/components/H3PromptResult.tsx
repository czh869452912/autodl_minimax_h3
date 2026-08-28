import React, { useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  ComposerPrimitive,
  CompositeAttachmentAdapter,
  MessagePrimitive,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  ThreadPrimitive,
  useAuiState,
  useLocalRuntime,
} from "@assistant-ui/react";
import {
  ArrowUp,
  Square,
  Plus,
  MessageSquare,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  History,
} from "lucide-react";
import type { AppSettings } from "../types";
import { createH3ChatModelAdapter } from "../agent/assistantAdapter";
import {
  createNewThreadId,
  deleteThread,
  getActiveThreadId,
  listThreads,
  loadThread,
  saveThread,
  setActiveThreadId,
  type StoredThreadSummary,
} from "../agent/threadStore";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface H3PromptResultProps {
  onApplyPrompt?: (prompt: string) => void;
  llmConfig: Pick<AppSettings, "llmApiKey" | "llmEndpoint" | "llmModel">;
}

const UserMessageComponent: React.FC = () => {
  return (
    <div className="mb-4 flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-md">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => <p className="whitespace-pre-wrap leading-relaxed">{text}</p>,
            Image: ({ image, filename }) => (
              <div className="my-2 max-w-xs overflow-hidden rounded-xl border border-indigo-400/40 bg-indigo-950/50 shadow-inner">
                <img src={image} className="max-h-60 w-full object-cover" alt={filename || "用户上传图片"} />
              </div>
            ),
            File: ({ filename, mimeType }) => (
              <div className="my-1 inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-950/40 px-2.5 py-1 text-xs text-indigo-100">
                <FileText className="h-3.5 w-3.5" />
                <span>{filename || mimeType || "文件附件"}</span>
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
};

const AssistantMessageComponent: React.FC = () => {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow-sm">
          AI
        </div>
        <span>Prompt 助手</span>
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-900/90 p-4 text-sm text-slate-200 shadow-md">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => <MarkdownRenderer content={text} />,
            Image: ({ image, filename }) => (
              <div className="my-2 max-w-sm overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-md">
                <img src={image} className="max-h-64 w-full object-contain" alt={filename || "参考图片"} />
              </div>
            ),
            File: ({ filename, mimeType }) => (
              <div className="my-1.5 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-200">
                <FileText className="h-4 w-4 text-indigo-400" />
                <span className="font-mono">{filename || mimeType || "附件文件"}</span>
              </div>
            ),
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

function StandardThread({
  threadId,
  onThreadUpdated,
}: {
  threadId: string;
  onThreadUpdated: () => void;
}) {
  const messages = useAuiState((state) => state.thread.messages);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const prevMessagesRef = React.useRef<string>("");
  const onThreadUpdatedRef = React.useRef(onThreadUpdated);
  onThreadUpdatedRef.current = onThreadUpdated;

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const serialized = JSON.stringify(messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    if (serialized === prevMessagesRef.current) return;
    prevMessagesRef.current = serialized;

    saveThread({
      threadId,
      messages: messages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
    });
    onThreadUpdatedRef.current?.();
  }, [messages, threadId]);

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6" autoScroll>
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-xl text-indigo-400 shadow-inner">
              ✨
            </div>
            <h2 className="mb-1 text-base font-bold text-slate-100">欢迎使用 Prompt 助手</h2>
            <p className="max-w-sm text-xs leading-relaxed text-slate-400">
              您可以输入视频场景构想，或上传参考图片、脚本文件，AI 将自主阅读官方技能库为您撰写和迭代精准提示词。
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
        {/* Attachment Previews */}
        <div className="mb-2 flex flex-wrap gap-2">
          <ComposerPrimitive.Attachments
            components={{
              Attachment: () => (
                <AttachmentPrimitive.Root className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 shadow-sm">
                  <Paperclip className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="max-w-[140px] truncate text-[11px]">
                    <AttachmentPrimitive.Name />
                  </span>
                  <AttachmentPrimitive.Remove className="ml-1 text-slate-400 transition-colors hover:text-red-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </AttachmentPrimitive.Remove>
                </AttachmentPrimitive.Root>
              ),
            }}
          />
        </div>

        <div className="relative flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 transition-colors focus-within:border-indigo-500">
          <ComposerPrimitive.AddAttachment
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-indigo-300 cursor-pointer"
            title="上传图片或文件"
          >
            <Paperclip className="h-4 w-4" />
          </ComposerPrimitive.AddAttachment>

          <ComposerPrimitive.Input
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none"
            placeholder="输入创作构想或上传参考图，按 Enter 发送..."
            submitMode="enter"
          />

          <div className="flex items-center gap-1">
            {isRunning ? (
              <ComposerPrimitive.Cancel className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-500">
                <Square className="h-3.5 w-3.5 fill-current" />
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
                <ArrowUp className="h-4 w-4" />
              </ComposerPrimitive.Send>
            )}
          </div>
        </div>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
};

function ActiveThreadContainer({
  threadId,
  llmConfig,
  onThreadUpdated,
}: {
  threadId: string;
  llmConfig: Pick<AppSettings, "llmApiKey" | "llmEndpoint" | "llmModel">;
  onThreadUpdated: () => void;
}) {
  const currentThreadData = useMemo(() => loadThread(threadId), [threadId]);

  const adapter = useMemo(() => createH3ChatModelAdapter({
    apiKey: llmConfig.llmApiKey || "",
    endpoint: llmConfig.llmEndpoint || "",
    model: llmConfig.llmModel || "",
  }), [llmConfig.llmApiKey, llmConfig.llmEndpoint, llmConfig.llmModel]);

  const attachmentAdapters = useMemo(() => new CompositeAttachmentAdapter([
    new SimpleImageAttachmentAdapter(),
    new SimpleTextAttachmentAdapter(),
  ]), []);

  const runtime = useLocalRuntime(adapter, {
    initialMessages: currentThreadData?.messages,
    adapters: {
      attachments: attachmentAdapters,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StandardThread threadId={threadId} onThreadUpdated={onThreadUpdated} />
    </AssistantRuntimeProvider>
  );
}

export function H3PromptResult({ llmConfig }: H3PromptResultProps) {
  const [activeThreadId, setActiveThreadState] = useState<string>(() => getActiveThreadId());
  const [threads, setThreads] = useState<StoredThreadSummary[]>(() => listThreads());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const refreshThreads = React.useCallback(() => {
    setThreads(listThreads());
  }, []);

  const handleSelectThread = (id: string) => {
    setActiveThreadId(id);
    setActiveThreadState(id);
    setIsDrawerOpen(false);
  };

  const handleCreateNewThread = () => {
    const newId = createNewThreadId();
    setActiveThreadId(newId);
    setActiveThreadState(newId);
    refreshThreads();
    setIsDrawerOpen(false);
  };

  const handleDeleteThread = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteThread(id);
    const updated = listThreads();
    setThreads(updated);
    if (activeThreadId === id) {
      const nextId = updated.length > 0 ? updated[0].threadId : createNewThreadId();
      setActiveThreadId(nextId);
      setActiveThreadState(nextId);
    }
  };

  const activeSummary = threads.find((t) => t.threadId === activeThreadId);

  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!llmConfig.llmApiKey || !llmConfig.llmEndpoint || !llmConfig.llmModel) {
      setRuntimeError("请先在设置中填写 OpenAI-compatible API Key、Endpoint 和 Model");
    } else {
      setRuntimeError(null);
    }
  }, [llmConfig.llmApiKey, llmConfig.llmEndpoint, llmConfig.llmModel]);

  return (
    <div className="flex h-[min(76vh,780px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Top Conversation Header & Controls */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-indigo-500/50 hover:bg-slate-800"
            title="查看历史对话列表"
          >
            <History className="h-3.5 w-3.5 text-indigo-400" />
            <span className="max-w-[130px] truncate">{activeSummary?.title || "当前对话"}</span>
            <span className="rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-300 font-mono">
              {threads.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreateNewThread}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 active:scale-95"
            title="开启新对话"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>新对话</span>
          </button>
        </div>
      </div>

      {/* History Drawer / Modal */}
      {isDrawerOpen && (
        <div className="border-b border-slate-800 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
              对话记录 ({threads.length})
            </span>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="text-slate-400 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {threads.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">暂无历史对话记录</p>
            ) : (
              threads.map((t) => {
                const isActive = t.threadId === activeThreadId;
                return (
                  <div
                    key={t.threadId}
                    onClick={() => handleSelectThread(t.threadId)}
                    className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? "border border-indigo-500/40 bg-indigo-950/40 text-indigo-200"
                        : "border border-transparent hover:bg-slate-800/80 text-slate-300"
                    }`}
                  >
                    <div className="flex flex-1 items-center gap-2 overflow-hidden pr-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-indigo-400" : "bg-slate-600"}`} />
                      <span className="truncate font-medium">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        {new Date(t.updatedAt).toLocaleDateString([], { month: "numeric", day: "numeric" })}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteThread(e, t.threadId)}
                        className="rounded p-1 text-slate-500 opacity-80 transition-colors hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                        title="删除对话"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {runtimeError && (
        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {runtimeError}
        </div>
      )}

      {/* Active Conversation Runtime */}
      <ActiveThreadContainer
        key={activeThreadId}
        threadId={activeThreadId}
        llmConfig={llmConfig}
        onThreadUpdated={refreshThreads}
      />
    </div>
  );
}

