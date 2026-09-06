import { AbstractAgent, type AgentConfig, type RunAgentInput } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { getOfficialH3SkillFiles } from './skillBundle';
import type { Attachment } from '@copilotkit/shared';
import { adaptDeepAgentStream } from './deepAgentStream';
import { applyImageIdentities, type ImageIdentity } from './imageMessageIdentity';

type DeepAgentGraph = { stream(input: unknown, options?: unknown): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown> };
const rec = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const textOf = (message: Record<string, any>): string => {
  const content = message.content ?? message.kwargs?.content ?? '';
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((part) => typeof part === 'string' ? part : String(rec(part).text ?? '')).join('') : '';
};
const imageContentPart = (part: Record<string, any>): Record<string, unknown> | null => {
  if (part.type === 'image_url' || part.type === 'file') return part;
  if (part.type !== 'image') return null;
  const source = rec(part.source);
  const value = String(source.value ?? part.data ?? '');
  if (!value) return null;
  if (source.type === 'url' || part.source_type === 'url') {
    return { type: 'image_url', image_url: { url: value } };
  }
  const url = value.startsWith('data:')
    ? value
    : `data:${source.mimeType ?? part.mime_type ?? 'image/png'};base64,${value}`;
  return { type: 'image_url', image_url: { url } };
};
const messagesForDeepAgent = (messages: RunAgentInput['messages']): unknown[] => {
  const resultIds = new Set(messages.flatMap((message) => {
    const value = rec(message);
    const id = value.tool_call_id ?? value.toolCallId;
    return id && (value.role === 'tool' || value.tool === 'tool' || !value.role) ? [String(id)] : [];
  }));
  return messages.flatMap((message): unknown[] => {
  const record = rec(message);
  const role = String(record.role ?? '').toLowerCase();
  const toolCallId = record.tool_call_id ?? record.toolCallId;
  // CopilotKit stores TOOL_CALL_RESULT events as UI-shaped objects without a
  // LangChain role. Normalize them before handing the transcript to LangChain.
  if (toolCallId && (role === 'tool' || record.tool === 'tool' || !role)) {
    return [{ role: 'tool' as const, content: textOf(record), tool_call_id: String(toolCallId) }];
  }
  if (role && !['user', 'human', 'assistant', 'ai', 'system', 'developer', 'tool'].includes(role)) return [];
  if ((role === 'assistant' || role === 'ai') && Array.isArray(record.toolCalls)) {
    const { toolCalls, ...rest } = record;
    return [{ ...rest, role: 'assistant', content: record.content ?? '', tool_calls: toolCalls.flatMap((value: unknown) => {
      const call = rec(value);
      const rawArgs = call.args ?? call.function?.arguments ?? {};
      let args: unknown = rawArgs;
      if (typeof rawArgs === 'string') {
        try { args = JSON.parse(rawArgs); } catch {
          // Stopping during argument streaming leaves an unexecuted partial
          // invocation in UI history. Keep its text and all valid paired calls.
          if (!resultIds.has(String(call.id))) return [];
          throw new Error(`Invalid saved arguments for completed tool call ${call.id}`);
        }
      }
      return [{ id: String(call.id), name: String(call.name ?? call.function?.name), args, type: 'tool_call' }];
    }) }];
  }
  const attachments = Array.isArray(record.attachments) ? record.attachments.map(rec) : [];
  const rawContent = Array.isArray(record.content) ? record.content.map(rec) : [];
  const contentImages = rawContent.some((part) => part.type === 'image' || part.type === 'image_url');
  if ((role !== 'user' && role !== 'human') || (attachments.length === 0 && !contentImages)) return [message];
  const content: Record<string, unknown>[] = [];
  if (typeof record.content === 'string' && record.content.trim()) content.push({ type: 'text', text: record.content });
  const addImageLabel = (image: Record<string, any>) => {
    const displayName = image.metadata?.displayName;
    if (typeof displayName === 'string' && displayName) content.push({ type: 'text', text: `参考图 @${displayName}` });
  };
  for (const part of rawContent) {
    if (part.type === 'text' && String(part.text ?? '').trim()) content.push({ type: 'text', text: String(part.text) });
    else if (part.type === 'image_url' || part.type === 'file') {
      if (part.type === 'image_url') addImageLabel(part);
      content.push(part);
    }
    else if (part.type === 'image') {
      const normalized = imageContentPart(part);
      if (normalized) { addImageLabel(part); content.push(normalized); }
    }
  }
  for (const attachment of attachments) {
    const source = rec(attachment.source);
    if (attachment.type !== 'image') continue;
    if (source.type === 'data') {
      addImageLabel(attachment);
      const value = String(source.value ?? '');
      const url = value.startsWith('data:')
        ? value
        : `data:${source.mimeType || 'image/png'};base64,${value}`;
      content.push({ type: 'image_url', image_url: { url } });
    } else if (source.type === 'url') {
      addImageLabel(attachment);
      content.push({ type: 'image_url', image_url: { url: String(source.value ?? '') } });
    }
  }
  return [{ ...record, role: 'user', content }];
  });
};

export class H3AgUiAgent extends AbstractAgent {
  private readonly graph: DeepAgentGraph;
  private abortController: AbortController | null = null;
  private pendingAttachments: Attachment[] = [];
  private pendingImageIdentities: ImageIdentity[] = [];
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
        }
      }).finally(() => {
        if (this.abortController === controller) this.abortController = null;
        subscriber.complete();
      });
      return () => controller.abort();
    });
  }

  abortRun(): void { this.abortController?.abort(); }
  dispose(): void {
    this.abortRun();
    this.pendingAttachments = [];
    this.pendingImageIdentities = [];
    this.consumePendingAttachments = undefined;
  }
  clone(): H3AgUiAgent { return new H3AgUiAgent(this.graph, { agentId: this.agentId, description: this.description }); }

  setPendingAttachments(attachments: Attachment[], onConsumed?: () => void): void {
    this.pendingAttachments = [...attachments];
    this.consumePendingAttachments = onConsumed;
  }

  setPendingImageIdentities(identities: ImageIdentity[]): void {
    this.pendingImageIdentities = [...identities];
  }

  addMessage(message: Parameters<AbstractAgent['addMessage']>[0]): void {
    if (message.role !== 'user') {
      super.addMessage(message);
      return;
    }
    let nextMessage = message;
    if (this.pendingAttachments.length > 0) {
      nextMessage = { ...message, attachments: this.pendingAttachments } as never;
      this.pendingAttachments = [];
      this.consumePendingAttachments?.();
      this.consumePendingAttachments = undefined;
    }
    const identities = this.pendingImageIdentities;
    this.pendingImageIdentities = [];
    super.addMessage(applyImageIdentities(nextMessage, identities));
  }

  private async runStream(input: RunAgentInput, signal: AbortSignal, subscriber: { next: (event: BaseEvent) => void }) {
    subscriber.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
    const stream = await this.graph.stream({ messages: messagesForDeepAgent(input.messages), files: getOfficialH3SkillFiles() }, { configurable: { thread_id: input.threadId }, signal, streamMode: 'messages' });
    let lastAssistantId: string | undefined;
    const incompleteIds = new Set<string>();
    const observeMessage = (id: string, incomplete: boolean) => {
      lastAssistantId = id;
      if (incomplete) incompleteIds.add(id);
    };
    const textIds = new Set<string>();
    const toolMessageIds = new Set<string>();
    for await (const event of adaptDeepAgentStream(stream, `assistant-${input.runId}`, signal, observeMessage)) {
      if (signal.aborted) return;
      if (event.type === 'TEXT_MESSAGE_START') {
        textIds.add(event.messageId);
      } else if (event.type === 'TOOL_CALL_START') {
        toolMessageIds.add(event.parentMessageId);
      }
      subscriber.next({ ...event, type: EventType[event.type] });
    }
    if (signal.aborted) return;
    const state = rec(input.state);
    const priorIds = Array.isArray(state.h3CompletedMessageIds) ? state.h3CompletedMessageIds.filter((id: unknown): id is string => typeof id === 'string') : [];
    const completed = new Set<string>(priorIds);
    if (lastAssistantId && textIds.has(lastAssistantId) && !toolMessageIds.has(lastAssistantId) && !incompleteIds.has(lastAssistantId)) completed.add(lastAssistantId);
    subscriber.next({ type: EventType.STATE_SNAPSHOT, snapshot: { ...state, h3CompletedMessageIds: [...completed] } } as never);
    subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } });
  }
}
