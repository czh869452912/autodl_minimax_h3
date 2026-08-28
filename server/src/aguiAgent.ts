import { AbstractAgent, type AgentConfig } from '@ag-ui/client';
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { Observable } from 'rxjs';

type MessageLike = Record<string, any>;
type DeepAgentGraph = {
  stream(input: unknown, options?: unknown): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
};

const asRecord = (value: unknown): MessageLike => value && typeof value === 'object' ? value as MessageLike : {};
const messageList = (value: unknown): MessageLike[] => {
  if (Array.isArray(value)) {
    if (value.length > 0 && value[0] && typeof value[0] === 'object' && !Array.isArray(value[0])) return [asRecord(value[0])];
    return value.flatMap(messageList);
  }
  const record = asRecord(value);
  if ('content' in record || 'tool_calls' in record || 'tool_call_id' in record) return [record];
  const messages = record.messages;
  if (Array.isArray(messages)) return messages.map(asRecord);
  if (messages && typeof messages === 'object') return [asRecord(messages)];
  return Object.values(record).flatMap(messageList);
};

const messageRole = (message: MessageLike) => String(message.role ?? message.type ?? message.kwargs?.role ?? message.kwargs?.type ?? '');
const messageText = (message: MessageLike): string => {
  const content = message.content ?? message.kwargs?.content ?? '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => typeof part === 'string' ? part : String(asRecord(part).text ?? '')).join('');
};
const toolCalls = (message: MessageLike): MessageLike[] => {
  const calls = message.tool_calls ?? message.kwargs?.tool_calls ?? message.additional_kwargs?.tool_calls;
  return Array.isArray(calls) ? calls.map(asRecord) : [];
};
const toolName = (call: MessageLike) => String(call.name ?? call.function?.name ?? 'tool');
const toolArgs = (call: MessageLike) => {
  const args = call.args ?? call.function?.arguments ?? {};
  return typeof args === 'string' ? args : JSON.stringify(args);
};

export class H3AgUiAgent extends AbstractAgent {
  private readonly graph: DeepAgentGraph;
  private abortController: AbortController | null = null;

  constructor(graph: DeepAgentGraph, config: AgentConfig = {}) {
    super({ agentId: 'h3-prompt-assistant', description: 'MiniMax H3 Prompt Assistant', ...config });
    this.graph = graph;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const abortController = new AbortController();
      this.abortController = abortController;
      void this.runStream(input, abortController.signal, subscriber).catch((error) => subscriber.error(error));
      return () => abortController.abort();
    });
  }

  abortRun() {
    this.abortController?.abort();
  }

  clone() {
    return new H3AgUiAgent(this.graph, { agentId: this.agentId, description: this.description });
  }

  private async runStream(input: RunAgentInput, signal: AbortSignal, subscriber: { next: (event: BaseEvent) => void; complete: () => void }) {
    subscriber.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
    const stream = await this.graph.stream({ messages: input.messages }, { configurable: { thread_id: input.threadId }, signal, streamMode: 'messages' });
    const openMessages = new Set<string>();
    const completedTools = new Set<string>();
    for await (const item of stream) {
      if (signal.aborted) return;
      for (const message of messageList(item)) {
        const role = messageRole(message).toLowerCase();
        const id = String(message.id ?? message.kwargs?.id ?? `assistant-${input.runId}`);
        if (role === 'tool' || message.tool_call_id) {
          const toolCallId = String(message.tool_call_id ?? message.kwargs?.tool_call_id ?? id);
          if (!completedTools.has(toolCallId)) {
            completedTools.add(toolCallId);
            subscriber.next({ type: EventType.TOOL_CALL_RESULT, messageId: id, toolCallId, content: messageText(message), role: 'tool' });
          }
          continue;
        }
        if (!['assistant', 'ai'].includes(role) && !message.tool_calls) continue;
        for (const call of toolCalls(message)) {
          const toolCallId = String(call.id ?? `${id}-tool-${toolName(call)}`);
          if (completedTools.has(toolCallId)) continue;
          if (!openMessages.has(`tool:${toolCallId}`)) {
            openMessages.add(`tool:${toolCallId}`);
            subscriber.next({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: toolName(call), parentMessageId: id });
            subscriber.next({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: toolArgs(call) });
            subscriber.next({ type: EventType.TOOL_CALL_END, toolCallId });
          }
        }
        const text = messageText(message);
        if (text) {
          if (!openMessages.has(`text:${id}`)) {
            openMessages.add(`text:${id}`);
            subscriber.next({ type: EventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant' });
          }
          subscriber.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: text });
          subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId: id });
        }
      }
    }
    if (!signal.aborted) {
      subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } });
      subscriber.complete();
    }
  }
}
