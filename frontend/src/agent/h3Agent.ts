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

async function* streamDeepAgent(agent: DeepAgent, input: H3AgentInput): AsyncGenerator<H3AgentEvent> {
  const stream = await agent.stream(
    { messages: input.messages as any, files: getOfficialH3SkillFiles() },
    {
      configurable: { thread_id: input.threadId },
      signal: input.signal,
    } as any,
  );

  for await (const item of stream as AsyncIterable<unknown>) {
    if (input.signal.aborted) return;
    const chunk = asChunk(Array.isArray(item) ? item[0] : item);
    for (const call of chunkToolCalls(chunk)) {
      const id = call.id || crypto.randomUUID();
      yield { type: "tool-start", id, name: String(call.name), args: call.args || {} };
      yield { type: "tool-end", id };
    }
    const text = chunkText(chunk);
    if (text) yield { type: "text", delta: text };
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

