import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import { streamH3Agent } from "./h3Agent";
import type { H3AgentConfig, H3AgentEvent } from "./agentTypes";

export function messageContent(message: ThreadMessage): unknown {
  const contentParts = typeof message.content === "string"
    ? [{ type: "text" as const, text: message.content }]
    : Array.isArray(message.content) ? [...message.content] : [];
  const attachmentParts = (message.attachments ?? []).flatMap((attachment) => attachment.content ?? []);
  const parts = [...contentParts, ...attachmentParts];
  if (parts.length === 0) return "";
  if (parts.every((part) => part.type === "text")) {
    return parts.map((part) => part.text).join("");
  }
  return parts.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image" && "image" in part) return { type: "image_url", image_url: { url: part.image } };
    if (part.type === "file") {
      return {
        type: "file",
        data: part.data,
        mimeType: part.mimeType,
        ...(part.filename ? { filename: part.filename } : {}),
      };
    }
    return null;
  }).filter(Boolean);
}

export function toAgentMessages(messages: readonly ThreadMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: messageContent(message),
  }));
}

function updateForEvent(event: H3AgentEvent): ChatModelRunResult | null {
  if (event.type === "text") return { content: [{ type: "text", text: event.delta }] };
  if (event.type === "tool-start") {
    return {
      content: [{
        type: "tool-call",
        toolCallId: event.id,
        toolName: event.name,
        args: event.args as any,
        argsText: JSON.stringify(event.args || {}),
      }],
    };
  }
  return null;
}

export function createH3ChatModelAdapter(config: H3AgentConfig): ChatModelAdapter {
  return {
    async *run(options: ChatModelRunOptions) {
      const input = {
        threadId: options.unstable_threadId || crypto.randomUUID(),
        messages: toAgentMessages(options.messages),
        signal: options.abortSignal,
      };
      for await (const event of streamH3Agent(input, config)) {
        if (event.type === "error") throw event.error;
        const update = updateForEvent(event);
        if (update) yield update;
      }
    },
  };
}
