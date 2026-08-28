import { useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useAui,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { Thread } from "@/components/thread";
import { ThreadListSidebar } from "@/components/threadlist-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppSettings } from "../types";
import { createH3ChatModelAdapter } from "../agent/assistantAdapter";
import {
  createH3ThreadListAdapter,
  getH3ActiveThreadId,
  setH3ActiveThreadId,
} from "../agent/localThreadAdapter";
import { parseNativeMediaPayload } from "./nativeMediaPayload";

interface H3PromptResultProps {
  onApplyPrompt?: (prompt: string) => void;
  llmConfig: Pick<AppSettings, "llmApiKey" | "llmEndpoint" | "llmModel">;
}

function NativeMediaBridge() {
  const aui = useAui();

  useEffect(() => {
    const previous = window.onMediaPicked;
    window.onMediaPicked = async (mediaJson: string) => {
      try {
        const media = parseNativeMediaPayload(mediaJson);
        if (!media) return;

        const response = await fetch(media.uri);
        if (!response.ok) throw new Error(`无法读取附件 (${response.status})`);
        const blob = await response.blob();
        const file = new File([blob], media.name || `image-${Date.now()}.png`, {
          type: media.mimeType || blob.type || "image/png",
        });
        await aui.composer.addAttachment(file);
      } catch (error) {
        console.error("onMediaPicked parse error in assistant-ui:", error);
      }
    };
    return () => {
      window.onMediaPicked = previous;
    };
  }, [aui]);

  return null;
}

function H3Runtime({
  llmConfig,
  activeThreadId,
  onThreadIdChange,
}: {
  llmConfig: Pick<AppSettings, "llmApiKey" | "llmEndpoint" | "llmModel">;
  activeThreadId: string | undefined;
  onThreadIdChange: (threadId: string | undefined) => void;
}) {
  const adapter = useMemo(
    () =>
      createH3ChatModelAdapter({
        apiKey: llmConfig.llmApiKey || "",
        endpoint: llmConfig.llmEndpoint || "",
        model: llmConfig.llmModel || "",
      }),
    [llmConfig.llmApiKey, llmConfig.llmEndpoint, llmConfig.llmModel],
  );
  const attachmentAdapters = useMemo(
    () =>
      new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
    [],
  );
  const threadListAdapter = useMemo(() => createH3ThreadListAdapter(), []);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadListAdapter,
    threadId: activeThreadId,
    onThreadIdChange,
    runtimeHook: () =>
      useLocalRuntime(adapter, {
        adapters: { attachments: attachmentAdapters },
      }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NativeMediaBridge />
      <SidebarProvider className="h-full min-h-0" style={{ minHeight: 0 }}>
        <div className="flex h-full min-h-0 w-full">
          <ThreadListSidebar />
          <SidebarInset className="relative h-full min-h-0 min-w-0 overflow-hidden">
            <SidebarTrigger
              className="absolute left-3 top-3 z-20 md:hidden"
              aria-label="Open thread list"
            />
          <Thread autoFocus={false} />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}

export function H3PromptResult({ llmConfig }: H3PromptResultProps) {
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(() =>
    getH3ActiveThreadId(),
  );

  const handleThreadIdChange = (threadId: string | undefined) => {
    setActiveThreadId(threadId);
    setH3ActiveThreadId(threadId);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
        <H3Runtime
          llmConfig={llmConfig}
          activeThreadId={activeThreadId}
          onThreadIdChange={handleThreadIdChange}
        />
      </div>
    </TooltipProvider>
  );
}
