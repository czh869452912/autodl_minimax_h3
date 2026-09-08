import { readPromptRuns } from './runState';
import { AbstractAgent, type AgentConfig, type RunAgentInput } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { Observable } from 'rxjs';
import { getOfficialH3SkillFiles } from './skillBundle';
import type { Attachment } from '@copilotkit/shared';
import { adaptDeepAgentStream } from './deepAgentStream';
import { applyImageIdentities, type ImageIdentity } from './imageMessageIdentity';
import { normalizeModelTranscript } from './modelTranscript';
import { hydrateModelImages } from './attachmentStore';

type DeepAgentGraph = { stream(input: unknown, options?: unknown): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown> };
type AgentExecutionOptions = {
  deadlineMs?: number;
  includeReasoningHistory?: boolean;
  workspace?: Pick<typeof import('./agentWorkspace'), 'prepareWorkspaceRun' | 'captureWorkspaceState'>;
  budget?: import('./agentTypes').H3ContextBudget;
};
const rec = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
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
export const messagesForDeepAgent = (messages: RunAgentInput['messages']): unknown[] => {
  return normalizeModelTranscript(messages).flatMap((message): unknown[] => {
  const record = rec(message);
  const role = String(record.role ?? '').toLowerCase();
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
  private cancelCurrentRun: (() => void) | undefined;
  private preparedRetry: { retryOf?: string; userMessageId: string; messages: RunAgentInput['messages']; workspace?: unknown } | undefined;
  private pendingAttachments: Attachment[] = [];
  private pendingImageIdentities: ImageIdentity[] = [];
  private consumePendingAttachments: (() => void) | undefined;

  constructor(graph: DeepAgentGraph, config: AgentConfig = {}, private readonly execution: AgentExecutionOptions = {}) {
    super({ agentId: 'h3-prompt-assistant', description: 'MiniMax H3 Prompt Assistant', ...config });
    this.graph = graph;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const controller = new AbortController();
      this.abortController = controller;
      const openTexts = new Set<string>();
      const openTools = new Set<string>();
      let terminal = false;
      const emit = (event: BaseEvent) => {
        if (terminal || subscriber.closed) return;
        const value = rec(event);
        if (event.type === EventType.TEXT_MESSAGE_START) openTexts.add(value.messageId);
        if (event.type === EventType.TEXT_MESSAGE_END) openTexts.delete(value.messageId);
        if (event.type === EventType.TOOL_CALL_START) openTools.add(value.toolCallId);
        if (event.type === EventType.TOOL_CALL_END) openTools.delete(value.toolCallId);
        if (event.type === EventType.RUN_ERROR || event.type === EventType.RUN_FINISHED) terminal = true;
        subscriber.next(event);
      };
      const closeStreams = () => {
        for (const toolCallId of openTools) emit({ type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent);
        for (const messageId of openTexts) emit({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);
      };
      this.cancelCurrentRun = () => {
        if (controller.signal.aborted || terminal) return;
        controller.abort();
        closeStreams();
        emit({ type: EventType.CUSTOM, name: 'h3.run.cancelled', value: { runId: input.runId } } as never);
        emit({ type: EventType.RUN_ERROR, code: 'abort', message: 'Run cancelled' } as never);
        subscriber.complete();
      };
      const deadline = this.execution.deadlineMs ? setTimeout(() => {
        if (terminal || subscriber.closed) return;
        controller.abort(); closeStreams();
        emit({ type: EventType.RUN_ERROR, code: 'deadline', message: '运行超过时间限制，已保留输出，请重试' } as never);
        subscriber.complete();
      }, this.execution.deadlineMs) : undefined;
      void this.runStream(input, controller.signal, { next: emit }).catch((error) => {
        if (!controller.signal.aborted && !terminal) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          console.error('[H3AgUiAgent] DeepAgents run failed', normalized.stack ?? normalized.message);
          closeStreams();
          emit({ type: EventType.RUN_ERROR, message: normalized.message, rawEvent: normalized } as never);
        }
      }).finally(() => {
        if (this.abortController === controller) { this.abortController = null; this.cancelCurrentRun = undefined; }
        subscriber.complete();
      });
      return () => {
        if (deadline) clearTimeout(deadline);
        controller.abort();
        if (this.abortController === controller) { this.abortController = null; this.cancelCurrentRun = undefined; }
      };
    });
  }

  abortRun(): void { this.cancelCurrentRun?.(); }

  getPreparedRetry() { return this.preparedRetry; }
  clearPreparedRetry(): void { this.preparedRetry = undefined; }

  prepareRetry(runId?: string): void {
    if (this.isRunning) throw new Error('请先停止当前运行');
    const runs = readPromptRuns(this.state);
    const run = runId ? runs.find(candidate => candidate.id === runId) : runs.at(-1);
    if (runId && !run) throw new Error('找不到可重试的运行');
    const userId = run?.userMessageId ?? [...this.messages].reverse().find(message => message.role === 'user')?.id;
    const index = this.messages.findIndex(message => message.id === userId);
    if (index < 0) throw new Error('没有可重试的用户消息');
    const state = rec(this.state);
    const workspace = run?.baseWorkspaceRevision ? (state.h3Workspaces ?? []).find((item: any) => item.revision === run.baseWorkspaceRevision) : undefined;
    if (run?.baseWorkspaceRevision && !workspace) throw new Error('重试所需的工作区版本缺失，请创建新的对话');
    this.preparedRetry = { retryOf: run?.id, userMessageId: userId!, messages: this.messages.slice(0, index + 1), workspace };
  }
  dispose(): void {
    this.abortRun();
    this.preparedRetry = undefined;
    this.pendingAttachments = [];
    this.pendingImageIdentities = [];
    this.consumePendingAttachments = undefined;
  }
  clone(): H3AgUiAgent {
    return new H3AgUiAgent(this.graph, {
      agentId: this.agentId, description: this.description, threadId: this.threadId,
      initialMessages: this.messages, initialState: this.state,
    }, this.execution);
  }

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
    const retry = this.preparedRetry;
    this.preparedRetry = undefined;
    const state = rec(input.state);
    const history = retry?.messages ?? input.messages;
    const reasoning = new Map(this.execution.includeReasoningHistory
      ? readPromptRuns(state).flatMap(run => (run.activities ?? []).flatMap(activity =>
        activity.kind === 'reasoning' && typeof activity.text === 'string' ? [[activity.messageId, activity.text] as const] : []))
      : []);
    const modelMessages = history.map(message => {
      const savedReasoning = reasoning.get(message.id);
      const additional = rec(rec(message).additional_kwargs);
      return message.role === 'assistant' && savedReasoning !== undefined && typeof additional.reasoning_content !== 'string'
        ? { ...message, additional_kwargs: { ...additional, reasoning_content: savedReasoning } } : message;
    });
    const modelInput = await hydrateModelImages(messagesForDeepAgent(modelMessages));
    if (signal.aborted) return;
    const workspaceAdapter = this.execution.workspace;
    const budget = this.execution.budget;
    const baseWorkspace = retry ? retry.workspace : state.h3Workspace;
    const prepared = workspaceAdapter?.prepareWorkspaceRun(baseWorkspace, modelInput, this.execution.budget);
    let workspace = baseWorkspace;
    const revision = Math.max(0, Number(state.h3Workspace?.revision) || 0) + 1;
    const rawStream = await this.graph.stream(prepared?.input ?? { messages: modelInput, files: getOfficialH3SkillFiles() }, { configurable: { thread_id: input.threadId }, context: prepared?.context, signal, streamMode: workspaceAdapter ? ['messages', 'values'] : 'messages' });
    const stream = (async function* () {
      for await (const value of rawStream) {
        if (signal.aborted) return;
        if (workspaceAdapter && Array.isArray(value) && value[0] === 'values') {
          workspace = workspaceAdapter.captureWorkspaceState(value[1], revision, budget);
          subscriber.next({ type: EventType.CUSTOM, name: 'h3.workspace', value: { runId: input.runId, workspace } } as never);
        } else yield workspaceAdapter && Array.isArray(value) && value[0] === 'messages' ? value[1] : value;
      }
    })();
    let lastAssistantId: string | undefined;
    const incompleteIds = new Set<string>();
    const finishReasons = new Map<string, string>();
    const observeMessage = (id: string, incomplete: boolean, finishReason?: string) => {
      lastAssistantId = id;
      if (incomplete) incompleteIds.add(id);
      if (finishReason) finishReasons.set(id, finishReason);
    };
    const textIds = new Set<string>();
    const toolMessageIds = new Set<string>();
    for await (const event of adaptDeepAgentStream(stream, `assistant-${input.runId}`, signal, observeMessage)) {
      if (signal.aborted) return;
      if (event.type === 'TEXT_MESSAGE_CONTENT' && event.delta.trim()) {
        textIds.add(event.messageId);
      } else if (event.type === 'TOOL_CALL_START') {
        toolMessageIds.add(event.parentMessageId);
      }
      subscriber.next({ ...event, type: EventType[event.type] });
    }
    if (signal.aborted) return;
    const priorIds = Array.isArray(state.h3CompletedMessageIds) ? state.h3CompletedMessageIds.filter((id: unknown): id is string => typeof id === 'string') : [];
    const completed = new Set<string>(priorIds);
    const hasFinalOutput = lastAssistantId && textIds.has(lastAssistantId) && !toolMessageIds.has(lastAssistantId) && !incompleteIds.has(lastAssistantId);
    if (hasFinalOutput && lastAssistantId) completed.add(lastAssistantId);
    subscriber.next({ type: EventType.STATE_SNAPSHOT, snapshot: { h3CompletedMessageIds: [...completed] } } as never);
    if (!hasFinalOutput) {
      const reason = lastAssistantId ? finishReasons.get(lastAssistantId) : undefined;
      const outputLimit = reason === 'length' || reason === 'max_tokens';
      const code = outputLimit ? 'output_limit' : reason === 'content_filter' ? 'content_filter' : lastAssistantId && incompleteIds.has(lastAssistantId) ? 'incomplete_output' : 'empty_output';
      const message = outputLimit
        ? `模型达到单次输出上限${budget ? `（${budget.outputTokens} tokens）` : ''}，未完成最终回复。思考可能占用同一预算；请在设置 → LLM 高级设置中提高最大输出后重试。已保留本次内容。`
        : reason === 'content_filter'
          ? '模型服务的内容过滤中断了回复，未完成最终输出。请调整输入后重试，已保留本次内容。'
          : code === 'incomplete_output'
            ? `模型服务中断了回复（${reason}），请重试。已保留本次内容。`
            : '模型本轮未返回最终回复（可能仅有思考或工具过程）。请重试；若反复发生，请检查最大输出预算和模型服务。已保留本次内容。';
      subscriber.next({ type: EventType.RUN_ERROR, code, message } as never);
      return;
    }
    subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } });
  }
}
