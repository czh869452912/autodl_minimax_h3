import { AbstractAgent, type AgentConfig, type RunAgentInput } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { getOfficialH3SkillFiles } from './skillBundle';
import type { Attachment } from '@copilotkit/shared';

type DeepAgentGraph = { stream(input: unknown, options?: unknown): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown> };
const rec = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const messagesOf = (item: unknown): Record<string, any>[] => {
  if (Array.isArray(item)) return item[0] && typeof item[0] === 'object' ? [rec(item[0])] : [];
  const obj = rec(item);
  if ('content' in obj || 'tool_calls' in obj || 'tool_call_id' in obj) return [obj];
  if (Array.isArray(obj.messages)) return obj.messages.map(rec);
  return Object.values(obj).flatMap((value) => messagesOf(value));
};
const textOf = (message: Record<string, any>): string => {
  const content = message.content ?? message.kwargs?.content ?? '';
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((part) => typeof part === 'string' ? part : String(rec(part).text ?? '')).join('') : '';
};
const callsOf = (message: Record<string, any>): Record<string, any>[] => {
  const calls = message.tool_calls ?? message.kwargs?.tool_calls ?? message.additional_kwargs?.tool_calls;
  return Array.isArray(calls) ? calls.map(rec) : [];
};
const messagesForDeepAgent = (messages: RunAgentInput['messages']): unknown[] => messages.map((message) => {
  const record = rec(message);
  const attachments = Array.isArray(record.attachments) ? record.attachments.map(rec) : [];
  if (record.role !== 'user' || attachments.length === 0) return message;
  const content: Record<string, unknown>[] = [];
  if (typeof record.content === 'string' && record.content.trim()) content.push({ type: 'text', text: record.content });
  for (const attachment of attachments) {
    const source = rec(attachment.source);
    if (attachment.type !== 'image') continue;
    if (source.type === 'data') {
      content.push({ type: 'image', source_type: 'base64', data: source.value, mime_type: source.mimeType });
    } else if (source.type === 'url') {
      content.push({ type: 'image', source_type: 'url', url: source.value });
    }
  }
  return { ...record, content };
});

export class H3AgUiAgent extends AbstractAgent {
  private readonly graph: DeepAgentGraph;
  private abortController: AbortController | null = null;
  private pendingAttachments: Attachment[] = [];
  private consumePendingAttachments: (() => void) | undefined;

  constructor(graph: DeepAgentGraph, config: AgentConfig = {}) {
    super({ agentId: 'h3-prompt-assistant', description: 'MiniMax H3 Prompt Assistant', ...config });
    this.graph = graph;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      this.abortController = controller;
      void this.runStream(input, controller.signal, subscriber).catch((error) => {
        if (!controller.signal.aborted) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          console.error('[H3AgUiAgent] DeepAgents run failed', normalized.stack ?? normalized.message);
          subscriber.next({ type: EventType.RUN_ERROR, message: normalized.message, rawEvent: normalized } as never);
          subscriber.complete();
        }
      });
      return () => controller.abort();
    });
  }

  abortRun(): void { this.abortController?.abort(); }
  clone(): H3AgUiAgent { return new H3AgUiAgent(this.graph, { agentId: this.agentId, description: this.description }); }

  setPendingAttachments(attachments: Attachment[], onConsumed?: () => void): void {
    this.pendingAttachments = [...attachments];
    this.consumePendingAttachments = onConsumed;
  }

  addMessage(message: Parameters<AbstractAgent['addMessage']>[0]): void {
    if (message.role !== 'user' || this.pendingAttachments.length === 0) {
      super.addMessage(message);
      return;
    }
    const attachments = this.pendingAttachments;
    this.pendingAttachments = [];
    this.consumePendingAttachments?.();
    this.consumePendingAttachments = undefined;
    super.addMessage({ ...message, attachments } as never);
  }

  private async runStream(input: RunAgentInput, signal: AbortSignal, subscriber: { next: (event: BaseEvent) => void; complete: () => void }) {
    subscriber.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
    const stream = await this.graph.stream({ messages: messagesForDeepAgent(input.messages), files: getOfficialH3SkillFiles() }, { configurable: { thread_id: input.threadId }, signal, streamMode: 'messages' });
    const openTexts = new Set<string>();
    const previous = new Map<string, string>();
    const completedTools = new Set<string>();
    const emittedTools = new Set<string>();
    const endedTools = new Set<string>();
    const previousToolArgs = new Map<string, string>();
    for await (const item of stream) {
      if (signal.aborted) return;
      for (const message of messagesOf(item)) {
        const role = String(message.role ?? message.type ?? message.kwargs?.role ?? '').toLowerCase();
        const id = String(message.id ?? message.kwargs?.id ?? `assistant-${input.runId}`);
        if (role === 'tool' || message.tool_call_id) {
          const toolCallId = String(message.tool_call_id ?? message.kwargs?.tool_call_id ?? id);
          if (!completedTools.has(toolCallId)) {
            completedTools.add(toolCallId);
            subscriber.next({ type: EventType.TOOL_CALL_RESULT, messageId: id, toolCallId, content: textOf(message), role: 'tool' });
          }
          continue;
        }
        if (!['assistant', 'ai'].includes(role) && !message.tool_calls) continue;
        for (const call of callsOf(message)) {
          const toolCallId = String(call.id ?? `${id}-tool`);
          if (completedTools.has(toolCallId)) continue;
          if (!emittedTools.has(toolCallId)) {
            emittedTools.add(toolCallId);
            subscriber.next({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: String(call.name ?? call.function?.name ?? 'tool'), parentMessageId: id });
          }
          const args = typeof call.args === 'string' ? call.args : JSON.stringify(call.args ?? {});
          const priorArgs = previousToolArgs.get(toolCallId) ?? '';
          const delta = args.startsWith(priorArgs) ? args.slice(priorArgs.length) : args;
          previousToolArgs.set(toolCallId, args);
          if (delta) subscriber.next({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta });
          if (!endedTools.has(toolCallId)) {
            endedTools.add(toolCallId);
            subscriber.next({ type: EventType.TOOL_CALL_END, toolCallId });
          }
        }
        const text = textOf(message);
        if (!text) continue;
        if (!openTexts.has(id)) { openTexts.add(id); subscriber.next({ type: EventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant' }); }
        const prior = previous.get(id) ?? '';
        const delta = text.startsWith(prior) ? text.slice(prior.length) : text;
        previous.set(id, text);
        if (delta) subscriber.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta });
      }
    }
    if (signal.aborted) return;
    for (const id of openTexts) subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId: id });
    subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } });
    subscriber.complete();
  }
}
