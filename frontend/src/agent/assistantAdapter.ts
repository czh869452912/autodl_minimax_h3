import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import { streamH3Agent } from "./h3Agent";
import type { H3AgentConfig } from "./agentTypes";

export const FINAL_OUTPUT_MARKERS = [
  "integrated_multimodal_description:",
  "final_prompt:",
  "最终输出：",
  "最终提示词：",
] as const;

export function hasFinalOutputMarker(text: string): boolean {
  const normalized = text.toLowerCase();
  return FINAL_OUTPUT_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()));
}

function appendTextPart(
  content: NonNullable<ChatModelRunResult["content"]>,
  type: "text" | "reasoning",
  text: string,
): NonNullable<ChatModelRunResult["content"]> {
  if (!text) return content;
  const lastPart = content.at(-1);
  if (lastPart?.type === type) {
    return [...content.slice(0, -1), { ...lastPart, text: lastPart.text + text }];
  }
  return [...content, { type, text }];
}

function moveTrailingReasoningToText(
  content: NonNullable<ChatModelRunResult["content"]>,
  length: number,
): NonNullable<ChatModelRunResult["content"]> {
  let remaining = length;
  let next = [...content];
  for (let index = next.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const part = next[index];
    if (part?.type !== "reasoning") continue;
    const moved = Math.min(remaining, part.text.length);
    const keep = part.text.slice(0, part.text.length - moved);
    next = keep
      ? [...next.slice(0, index), { ...part, text: keep }, ...next.slice(index + 1)]
      : [...next.slice(0, index), ...next.slice(index + 1)];
    remaining -= moved;
  }
  return next;
}

function promoteLastReasoningPart(
  content: NonNullable<ChatModelRunResult["content"]>,
): NonNullable<ChatModelRunResult["content"]> {
  let index = -1;
  for (let candidate = content.length - 1; candidate >= 0; candidate -= 1) {
    if (content[candidate]?.type === "reasoning") {
      index = candidate;
      break;
    }
  }
  if (index < 0) return content;
  const part = content[index];
  if (part.type !== "reasoning") return content;
  return [...content.slice(0, index), { type: "text", text: part.text }, ...content.slice(index + 1)];
}

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

export function createH3ChatModelAdapter(config: H3AgentConfig): ChatModelAdapter {
  return {
    async *run(options: ChatModelRunOptions) {
      const input = {
        threadId: options.unstable_threadId || crypto.randomUUID(),
        messages: toAgentMessages(options.messages),
        signal: options.abortSignal,
      };
      let content: NonNullable<ChatModelRunResult["content"]> = [];
      let streamedText = "";
      let finalOutputStarted = false;
      for await (const event of streamH3Agent(input, config)) {
        if (event.type === "error") throw event.error;
        if (event.type === "text") {
          const previousTextLength = streamedText.length;
          streamedText += event.delta;
          if (!finalOutputStarted) {
            const markerIndex = FINAL_OUTPUT_MARKERS.reduce((first, marker) => {
              const index = streamedText.toLowerCase().indexOf(marker.toLowerCase());
              return index >= 0 && (first < 0 || index < first) ? index : first;
            }, -1);
            if (markerIndex < 0) {
              content = appendTextPart(content, "reasoning", event.delta);
            } else {
              finalOutputStarted = true;
              if (markerIndex < previousTextLength) {
                content = moveTrailingReasoningToText(content, previousTextLength - markerIndex);
                content = appendTextPart(content, "text", streamedText.slice(markerIndex));
              } else {
                const reasoningDelta = streamedText.slice(previousTextLength, markerIndex);
                const finalDelta = streamedText.slice(markerIndex);
                content = appendTextPart(content, "reasoning", reasoningDelta);
                content = appendTextPart(content, "text", finalDelta);
              }
            }
          } else {
            content = appendTextPart(content, "text", event.delta);
          }
          yield { content };
        } else if (event.type === "tool-start") {
          content = [...content, {
            type: "tool-call",
            toolCallId: event.id,
            toolName: event.name,
            args: event.args as any,
            argsText: JSON.stringify(event.args || {}),
          }];
          yield { content };
        } else if (event.type === "tool-end") {
          content = content.map((part) => part.type === "tool-call" && part.toolCallId === event.id
            ? { ...part, result: null }
            : part);
          yield { content };
        }
      }
      if (!finalOutputStarted) {
        const finalized = promoteLastReasoningPart(content);
        if (finalized !== content) yield { content: finalized };
      }
    },
  };
}
