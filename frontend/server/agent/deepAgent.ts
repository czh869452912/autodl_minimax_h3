import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';
import { BuiltInAgent } from '@copilotkit/runtime/v2';
import type { ServerConfig } from '../config';

type StreamChunk = {
  content?: unknown;
  text?: unknown;
  tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
  tool_call_chunks?: Array<{ id?: string; name?: string; args?: unknown }>; 
};

const skillRoot = path.resolve(import.meta.dirname, '../skills/minimax-h3');
const skillDirectories = [
  '3d-animation-short-generator',
  'brand-promo-video-generator',
  'co-op-game-intro-generator',
  'h3-prompt-writing',
  'handdrawn-live-video-generator',
  'minimalist-product-ad-generator',
  'music-video-subtitle-generator',
  'paper-collage-explainer-generator',
  'papercraft-stop-motion-explainer',
].map((name) => path.join(skillRoot, name));

const checkpointer = new MemorySaver();

export function createH3DeepAgent(config: ServerConfig) {
  const model = new ChatOpenAI({
    model: config.model,
    temperature: 0.3,
    apiKey: config.apiKey,
    configuration: { baseURL: config.endpoint },
  });

  return createDeepAgent({
    model,
    skills: skillDirectories,
    checkpointer,
    systemPrompt: [
      'You are the Prompt Assistant for MiniMax H3 video generation.',
      'You are a real autonomous agent: inspect the available official skill files, choose one or more skills based on the request, and iterate your draft until it is production-ready.',
      'Use the filesystem skill loader to read the complete SKILL.md and referenced files when needed. Do not replace official skills with a copied template or a hard-coded route.',
      'When multiple official skills apply, use them together and explain the synthesis in the final answer.',
      'This app does not expose MiniMax Hub hub_* tools. If a selected skill requires Hub or canvas tools, produce a clearly marked pre-production package and state that final generation is blocked until those tools are connected. Never claim that a video was generated.',
      'Return the final H3 prompt in a clearly labeled section, with any assumptions and unresolved tool requirements after it.',
    ].join('\n'),
  });
}

function asChunk(value: unknown): StreamChunk {
  if (!value || typeof value !== 'object') return {};
  return value as StreamChunk;
}

function chunkText(chunk: StreamChunk): string {
  if (typeof chunk.content === 'string') return chunk.content;
  if (typeof chunk.text === 'string') return chunk.text;
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((part) => (typeof part === 'string' ? part : typeof part === 'object' && part && 'text' in part ? String((part as { text?: unknown }).text || '') : ''))
      .join('');
  }
  return '';
}

function toolCalls(chunk: StreamChunk) {
  return [...(chunk.tool_calls || []), ...(chunk.tool_call_chunks || [])].filter((call) => call.name);
}

export async function* streamDeepAgentEvents(
  stream: AsyncIterable<unknown>,
  runId: string,
  signal?: AbortSignal,
): AsyncGenerator<BaseEvent> {
  yield { type: EventType.RUN_STARTED, runId, threadId: runId } as BaseEvent;
  const messageId = randomUUID();
  let textStarted = false;

  for await (const item of stream) {
    if (signal?.aborted) break;
    const raw = Array.isArray(item) ? item[0] : item;
    const chunk = asChunk(raw);

    for (const call of toolCalls(chunk)) {
      const toolCallId = call.id || randomUUID();
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: call.name,
      } as BaseEvent;
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: typeof call.args === 'string' ? call.args : JSON.stringify(call.args || {}),
      } as BaseEvent;
      yield { type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent;
    }

    const text = chunkText(chunk);
    if (!text) continue;
    if (!textStarted) {
      textStarted = true;
      yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent;
    }
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text } as BaseEvent;
  }

  if (textStarted) yield { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent;
  yield { type: EventType.RUN_FINISHED, runId, threadId: runId } as BaseEvent;
}

export async function collectDeepAgentEvents(
  stream: AsyncIterable<unknown>,
  runId: string,
  signal?: AbortSignal,
): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  for await (const event of streamDeepAgentEvents(stream, runId, signal)) events.push(event);
  return events;
}

export function createCopilotH3Agent(config: ServerConfig) {
  const agent = new BuiltInAgent({
    type: 'custom',
    factory: async function* ({ input, abortSignal }) {
      const agent = createH3DeepAgent(config);
      const messages = input.messages.map((message) => ({ role: message.role, content: message.content })) as any;
      const stream = await agent.stream(
        { messages } as any,
        { configurable: { thread_id: input.threadId || input.runId || randomUUID() } },
      );
      for await (const event of streamDeepAgentEvents(stream, input.runId, abortSignal)) yield event;
    },
  });
  agent.agentId = 'h3-prompt-assistant';
  agent.description = 'Autonomous MiniMax H3 prompt agent powered by Deep Agents';
  return agent;
}
