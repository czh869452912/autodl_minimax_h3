import { createDeepAgent, type DeepAgent } from 'deepagents/browser';
import { adaptDeepAgentStream } from './deepAgentStream';
import type { H3AgentConfig, H3AgentEvent, H3AgentInput } from './agentTypes';
import { officialH3SkillRoot } from './skillBundle';
import { createOpenAICompatibleModel, type ModelFactory, validateH3AgentConfig } from './modelAdapter';
import { createH3WorkspaceBackend, createH3WorkspaceMiddleware, getH3ContextBudget } from './agentWorkspace';
import { isDeepSeekV4 } from '../config/llmReasoning';

const H3_SYSTEM_POLICY = [
  'You are the MiniMax H3 Prompt Assistant running as a local autonomous agent.',
  "Inspect the official skill files and choose one or more skills based on the user's request.",
  'Read the complete matching SKILL.md and referenced files through filesystem tools before drafting.',
  'Iterate through multiple model and tool rounds when needed; do not use a fixed application template or skill branch table.',
  'This APK has no MiniMax Hub canvas tools. If a selected skill requires them, return a clearly marked pre-production package and never claim final generation occurred.',
  'Return the final H3 prompt in a fenced h3-prompt code block. Follow the selected official skill output rules: include a non-empty integrated_multimodal_description for the base format, or all six official Ref2VA fields for Ref2VA.',
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
  const backend = createH3WorkspaceBackend();
  return createDeepAgent({
    model: (dependencies.modelFactory ?? createOpenAICompatibleModel)(config),
    skills: [officialH3SkillRoot],
    systemPrompt: H3_SYSTEM_POLICY,
    backend,
    middleware: createH3WorkspaceMiddleware(backend, getH3ContextBudget(config), { includeReasoning: isDeepSeekV4(config.model) && config.reasoningEffort !== 'none' }),
  });
}

async function* streamDeepAgent(agent: DeepAgent, input: H3AgentInput): AsyncGenerator<H3AgentEvent> {
  const stream = await (agent as unknown as { stream: (state: unknown, config: unknown) => Promise<AsyncIterable<unknown>> }).stream(
    { messages: input.messages as never[] },
    { configurable: { thread_id: input.threadId }, signal: input.signal, streamMode: 'messages' } as never,
  );
  const tools = new Map<string, { name: string; args: string }>();
  const text = new Map<string, string>();
  const toolMessageIds = new Set<string>();
  let lastAssistantId: string | undefined;
  const incompleteIds = new Set<string>();
  const observeMessage = (id: string, incomplete: boolean) => {
    lastAssistantId = id;
    if (incomplete) incompleteIds.add(id);
  };
  for await (const event of adaptDeepAgentStream(stream, 'assistant', input.signal, observeMessage)) {
    if (event.type === 'TOOL_CALL_START') {
      toolMessageIds.add(event.parentMessageId);
      tools.set(event.toolCallId, { name: event.toolCallName, args: '' });
    } else if (event.type === 'TOOL_CALL_ARGS') {
      tools.get(event.toolCallId)!.args += event.delta;
    } else if (event.type === 'TOOL_CALL_END') {
      const tool = tools.get(event.toolCallId)!;
      let args: unknown = tool.args;
      try { args = JSON.parse(tool.args); } catch { /* Preserve provider arguments. */ }
      // This legacy event contract has no tool-args delta event, so expose the
      // invocation only once its arguments are complete.
      yield { type: 'tool-start', id: event.toolCallId, name: tool.name, args };
    } else if (event.type === 'TOOL_CALL_RESULT' && tools.has(event.toolCallId)) {
      yield { type: 'tool-end', id: event.toolCallId };
    } else if (event.type === 'TEXT_MESSAGE_START') {
      text.set(event.messageId, '');
    } else if (event.type === 'TEXT_MESSAGE_CONTENT') {
      text.set(event.messageId, (text.get(event.messageId) ?? '') + event.delta);
    }
  }
  if (input.signal.aborted) return;
  // The legacy phase field cannot be revised. Wait for the run to succeed
  // before labelling its final message; earlier model rounds are thinking.
  for (const [id, delta] of text) {
    yield { type: 'text', delta, phase: id === lastAssistantId && !toolMessageIds.has(id) && !incompleteIds.has(id) ? 'final' : 'thinking' };
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
