import { createDeepAgent, type DeepAgent } from 'deepagents/browser';
import type { H3AgentConfig, H3AgentEvent, H3AgentInput } from './agentTypes';
import { getOfficialH3SkillFiles, officialH3SkillRoot } from './skillBundle';
import { createOpenAICompatibleModel, type ModelFactory, validateH3AgentConfig } from './modelAdapter';

const H3_SYSTEM_POLICY = [
  'You are the MiniMax H3 Prompt Assistant running as a local autonomous agent.',
  "Inspect the official skill files and choose one or more skills based on the user's request.",
  'Read the complete matching SKILL.md and referenced files through filesystem tools before drafting.',
  'Iterate through multiple model and tool rounds when needed; do not use a fixed application template or skill branch table.',
  'This APK has no MiniMax Hub canvas tools. If a selected skill requires them, return a clearly marked pre-production package and never claim final generation occurred.',
  'Return the final H3 prompt in a fenced Markdown code block with integrated_multimodal_description: clearly labeled.',
].join('\n');

export type H3AgentDependencies = {
  modelFactory?: ModelFactory;
  agentFactory?: () => AsyncIterable<H3AgentEvent> | Promise<AsyncIterable<H3AgentEvent>>;
};

export function normalizeCumulativeText(previous: string, next: string): { previous: string; delta: string } {
  if (!next) return { previous, delta: '' };
  if (previous && next.startsWith(previous)) return { previous: next, delta: next.slice(previous.length) };
  return { previous: next, delta: next };
}

export function createH3Agent(config: H3AgentConfig, dependencies: Pick<H3AgentDependencies, 'modelFactory'> = {}): DeepAgent {
  validateH3AgentConfig(config);
  return createDeepAgent({
    model: (dependencies.modelFactory ?? createOpenAICompatibleModel)(config),
    skills: [officialH3SkillRoot],
    systemPrompt: H3_SYSTEM_POLICY,
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function contentText(message: Record<string, unknown>): string {
  const kwargs = record(message.kwargs);
  const content = message.content ?? kwargs.content ?? message.text;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    return part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : '';
  }).join('');
}

function isAssistantMessage(message: Record<string, unknown>): boolean {
  const kwargs = record(message.kwargs);
  const role = message.role ?? kwargs.role;
  const type = message.type ?? kwargs.type;
  const constructorId = Array.isArray(message.id) ? message.id.join('/') : String(message.id ?? '');
  if (/HumanMessage|ToolMessage|SystemMessage/i.test(constructorId)) return false;
  if (/AIMessage|AssistantMessage/i.test(constructorId)) return true;
  if (['user', 'human', 'system', 'tool'].includes(String(role)) || ['user', 'human', 'system', 'tool'].includes(String(type))) return false;
  return ['assistant', 'ai'].includes(String(role)) || ['assistant', 'ai'].includes(String(type)) || (!role && !type);
}

function messagesFromStreamItem(item: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(item)) return item[0] && typeof item[0] === 'object' ? [record(item[0])] : [];
  const direct = record(item);
  if ('content' in direct || 'kwargs' in direct) return [direct];
  return Object.values(direct).flatMap((value) => {
    const messages = record(value).messages;
    if (Array.isArray(messages)) return messages.map(record);
    return messages && typeof messages === 'object' ? [record(messages)] : [];
  });
}

function toolCalls(message: Record<string, unknown>): Array<{ id: string; name: string; args: unknown }> {
  const kwargs = record(message.kwargs);
  const additional = record(message.additional_kwargs);
  const raw = message.tool_calls ?? kwargs.tool_calls ?? additional.tool_calls ?? message.tool_call_chunks ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const call = record(item);
    const fn = record(call.function);
    const name = call.name ?? fn.name;
    if (!name) return [];
    let args: unknown = call.args ?? fn.arguments ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { /* retain provider string */ }
    }
    return [{ id: String(call.id ?? crypto.randomUUID()), name: String(name), args }];
  });
}

async function* streamDeepAgent(agent: DeepAgent, input: H3AgentInput): AsyncGenerator<H3AgentEvent> {
  const stream = await (agent as unknown as { stream: (state: unknown, config: unknown) => Promise<AsyncIterable<unknown>> }).stream(
    { messages: input.messages as never[], files: getOfficialH3SkillFiles() },
    { configurable: { thread_id: input.threadId }, signal: input.signal, streamMode: 'messages' } as never,
  );
  const previousText = new Map<string, string>();
  const emittedTools = new Set<string>();
  for await (const item of stream as AsyncIterable<unknown>) {
    if (input.signal.aborted) return;
    for (const message of messagesFromStreamItem(item)) {
      if (!isAssistantMessage(message)) continue;
      const calls = toolCalls(message);
      for (const call of calls) {
        if (emittedTools.has(call.id)) continue;
        emittedTools.add(call.id);
        yield { type: 'tool-start', ...call };
        yield { type: 'tool-end', id: call.id };
      }
      const kwargs = record(message.kwargs);
      const isToolResult = message.type === 'tool' || 'tool_call_id' in message || 'tool_call_id' in kwargs;
      const text = contentText(message);
      if (!text || isToolResult) continue;
      const key = String(message.id ?? kwargs.id ?? 'assistant');
      const normalized = normalizeCumulativeText(previousText.get(key) ?? '', text);
      previousText.set(key, normalized.previous);
      if (normalized.delta) yield { type: 'text', delta: normalized.delta, phase: calls.length ? 'thinking' : 'final' };
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
    yield { type: 'status', message: 'Reading official H3 skills' };
    yield* streamDeepAgent(createH3Agent(config, dependencies), input);
  } catch (error) {
    if (!input.signal.aborted) yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}
