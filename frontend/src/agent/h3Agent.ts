import { createDeepAgent, type DeepAgent } from "deepagents/browser";
import { getOfficialH3SkillFiles, officialH3SkillRoot } from "./skillBundle";
import type { H3AgentConfig, H3AgentEvent, H3AgentInput } from "./agentTypes";
import { createOpenAICompatibleModel, type ModelFactory, validateH3AgentConfig } from "./modelAdapter";

const H3_SYSTEM_POLICY = [
  "You are the MiniMax H3 Prompt Assistant running as a local autonomous agent.",
  "Inspect the official skill files and choose one or more skills based on the user's request.",
  "Read the complete matching SKILL.md and referenced files through the filesystem tools before drafting.",
  "Iterate through multiple model and tool rounds when needed; do not use a fixed application template or skill branch table.",
  "This APK has no MiniMax Hub hub_* or canvas tools. If a selected skill requires them, return a clearly marked pre-production package and never claim final generation occurred.",
  "Return the final H3 prompt with integrated_multimodal_description: clearly labeled, followed by assumptions and unresolved requirements.",
].join("\n");

type AgentFactory = (config: H3AgentConfig) => DeepAgent;

export function normalizeCumulativeText(previous: string, next: string): { previous: string; delta: string } {
  if (!next) return { previous, delta: "" };
  if (previous && next.startsWith(previous)) {
    return { previous: next, delta: next.slice(previous.length) };
  }
  return { previous: next, delta: next };
}

export type H3AgentDependencies = {
  modelFactory?: ModelFactory;
  agentFactory?: () => AsyncIterable<H3AgentEvent> | Promise<AsyncIterable<H3AgentEvent>>;
};

export function createH3Agent(config: H3AgentConfig, dependencies: Pick<H3AgentDependencies, "modelFactory"> = {}): DeepAgent {
  validateH3AgentConfig(config);
  const model = (dependencies.modelFactory || createOpenAICompatibleModel)(config);
  return createDeepAgent({
    model,
    skills: [officialH3SkillRoot],
    systemPrompt: H3_SYSTEM_POLICY,
  });
}

function asChunk(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

export function isAssistantMessage(message: Record<string, unknown>): boolean {
  const kwargs = asChunk(message.kwargs);
  const role = message.role ?? kwargs.role;
  const type = message.type ?? kwargs.type;
  if (role === "user" || role === "human" || role === "system" || role === "tool") return false;
  if (type === "human" || type === "user" || type === "system" || type === "tool") return false;
  return role === "assistant" || role === "ai" || type === "assistant" || type === "ai" || (!role && !type);
}

function chunkText(chunk: Record<string, unknown>): string {
  const content = chunk.content ?? chunk.text;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text || "");
    return "";
  }).join("");
}

function chunkToolCalls(chunk: Record<string, unknown>): Array<{ id?: string; name?: string; args?: unknown }> {
  const calls = [
    ...(Array.isArray(chunk.tool_calls) ? chunk.tool_calls : []),
    ...(Array.isArray(chunk.tool_call_chunks) ? chunk.tool_call_chunks : []),
  ];
  return calls.filter((call): call is { id?: string; name?: string; args?: unknown } => Boolean(call && typeof call === "object" && (call as { name?: unknown }).name));
}

function extractMessagesFromItem(item: unknown): Array<Record<string, unknown>> {
  if (!item || typeof item !== "object") return [];
  if (Array.isArray(item)) {
    const [first] = item;
    if (first && typeof first === "object") return [first as Record<string, unknown>];
    return [];
  }
  const obj = item as Record<string, unknown>;
  if ("content" in obj || "kwargs" in obj) {
    return [obj];
  }
  const messages: Array<Record<string, unknown>> = [];
  for (const value of Object.values(obj)) {
    if (!value || typeof value !== "object") continue;
    const nodeState = value as Record<string, unknown>;
    if (Array.isArray(nodeState.messages)) {
      for (const msg of nodeState.messages) {
        if (msg && typeof msg === "object") {
          messages.push(msg as Record<string, unknown>);
        }
      }
    } else if ("messages" in nodeState && nodeState.messages && typeof nodeState.messages === "object") {
      messages.push(nodeState.messages as Record<string, unknown>);
    }
  }
  return messages;
}

function extractMessageContent(msg: Record<string, unknown>): string {
  const content = msg.content ?? (msg.kwargs as Record<string, unknown> | undefined)?.content ?? msg.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: unknown }).text || "");
      }
      return "";
    }).join("");
  }
  return "";
}

function extractMessageToolCalls(msg: Record<string, unknown>): Array<{ id?: string; name: string; args: unknown }> {
  const rawCalls =
    msg.tool_calls ??
    (msg.kwargs as Record<string, unknown> | undefined)?.tool_calls ??
    (msg.additional_kwargs as Record<string, unknown> | undefined)?.tool_calls ??
    msg.tool_call_chunks ??
    [];
  if (!Array.isArray(rawCalls)) return [];
  return rawCalls
    .filter((call): call is Record<string, unknown> => Boolean(call && typeof call === "object" && ((call as { name?: unknown }).name || (call as { function?: { name?: unknown } }).function?.name)))
    .map((call) => {
      const name = String(call.name || (call.function as { name?: unknown })?.name);
      let args = call.args ?? (call.function as { arguments?: unknown })?.arguments ?? {};
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          // ignore invalid json string
        }
      }
      const id = String(call.id || crypto.randomUUID());
      return { id, name, args };
    });
}

async function* streamDeepAgent(agent: DeepAgent, input: H3AgentInput): AsyncGenerator<H3AgentEvent> {
  const lastTextByMessage = new Map<string, string>();
  let lastChunkText = "";
  const stream = await agent.stream(
    { messages: input.messages as any, files: getOfficialH3SkillFiles() },
    {
      configurable: { thread_id: input.threadId },
      signal: input.signal,
    } as any,
  );

  for await (const item of stream as AsyncIterable<unknown>) {
    if (input.signal.aborted) return;
    const messages = extractMessagesFromItem(item);
    if (messages.length === 0) {
      const chunk = asChunk(Array.isArray(item) ? item[0] : item);
      for (const call of chunkToolCalls(chunk)) {
        const id = call.id || crypto.randomUUID();
        yield { type: "tool-start", id, name: String(call.name), args: call.args || {} };
        yield { type: "tool-end", id };
      }
      const text = chunkText(chunk);
      const normalized = normalizeCumulativeText(lastChunkText, text);
      lastChunkText = normalized.previous;
      if (normalized.delta) yield { type: "text", delta: normalized.delta };
      continue;
    }

    for (const msg of messages) {
      if (!isAssistantMessage(msg)) continue;
      const toolCalls = extractMessageToolCalls(msg);
      for (const call of toolCalls) {
        yield { type: "tool-start", id: call.id || crypto.randomUUID(), name: call.name, args: call.args || {} };
        yield { type: "tool-end", id: call.id || crypto.randomUUID() };
      }
      const isTool = (
        msg.type === "tool" ||
        (msg.kwargs as Record<string, unknown> | undefined)?.status !== undefined ||
        "tool_call_id" in msg ||
        (msg.kwargs as Record<string, unknown> | undefined)?.tool_call_id !== undefined
      );
      const text = extractMessageContent(msg);
      if (text && !isTool) {
        const messageKey = String(msg.id || (msg.kwargs as Record<string, unknown> | undefined)?.id || "assistant");
        const normalized = normalizeCumulativeText(lastTextByMessage.get(messageKey) || "", text);
        lastTextByMessage.set(messageKey, normalized.previous);
        if (normalized.delta) yield { type: "text", delta: normalized.delta };
      }
    }
  }
}

export async function* streamH3Agent(
  input: H3AgentInput,
  config: H3AgentConfig,
  dependencies: H3AgentDependencies = {},
): AsyncGenerator<H3AgentEvent> {
  try {
    validateH3AgentConfig(config);
    if (dependencies.agentFactory) {
      const events = await dependencies.agentFactory();
      for await (const event of events) {
        if (input.signal.aborted) return;
        yield event;
      }
      return;
    }
    yield { type: "status", message: "Reading official H3 skills" };
    yield* streamDeepAgent(createH3Agent(config, dependencies), input);
  } catch (error) {
    if (input.signal.aborted) return;
    yield { type: "error", error: error instanceof Error ? error : new Error(String(error)) };
  }
}

