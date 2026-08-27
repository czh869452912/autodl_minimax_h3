import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import { streamH3Agent } from "./h3Agent";
import type { H3AgentConfig, H3AgentEvent } from "./agentTypes";

function messageContent(message: ThreadMessage): unknown {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    if (part.type === "image" && "image" in part) return { type: "image_url", image_url: { url: part.image } };
    if (part.type === "file" && "url" in part) return { type: "file", url: part.url };
    return null;
  }).filter(Boolean);
}

function toAgentMessages(messages: readonly ThreadMessage[]) {
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
