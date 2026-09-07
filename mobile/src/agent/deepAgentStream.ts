import { AIMessageChunk } from '@langchain/core/messages';

type RecordValue = Record<string, any>;
const rec = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {};
export type StreamEvent =
  | { type: 'CUSTOM'; name: 'h3.reasoning'; value: { messageId: string; delta: string } }
  | { type: 'CUSTOM'; name: 'h3.tool.status'; value: { toolCallId: string; status: 'complete' | 'failed'; summary: string } }
  | { type: 'TEXT_MESSAGE_START'; messageId: string; role: 'assistant' }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string; parentMessageId: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string }
  | { type: 'TOOL_CALL_RESULT'; messageId: string; toolCallId: string; content: string; role: 'tool' };

function messagesOf(item: unknown): RecordValue[] {
  if (Array.isArray(item)) {
    // LangGraph messages mode emits [message, metadata].
    if (item.length === 2 && !('content' in rec(item[1])) && !('kwargs' in rec(item[1]))) return messagesOf(item[0]);
    return item.flatMap(messagesOf);
  }
  const value = rec(item);
  if ('content' in value || 'kwargs' in value || 'tool_calls' in value || 'tool_call_chunks' in value) return [value];
  return Object.values(value).flatMap(part => part && typeof part === 'object' ? messagesOf(part) : []);
}
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map(part => typeof part === 'string' ? part : ['thinking', 'reasoning'].includes(rec(part).type) ? '' : String(rec(part).text ?? '')).join('') : '';
}

function reasoningOf(message: RecordValue): string {
  const extra = message.additional_kwargs;
  if (typeof extra?.reasoning_content === 'string') return extra.reasoning_content;
  if (typeof extra?.reasoning === 'string') return extra.reasoning;
  return Array.isArray(message.content) ? message.content.map((part: unknown) => {
    const block = rec(part);
    return ['thinking', 'reasoning'].includes(block.type) ? String(block.thinking ?? block.reasoning ?? block.text ?? '') : '';
  }).join('') : '';
}

type ToolState = { id: string; name: string; args: string; started: boolean; ended: boolean };
type MessageState = { text: string; reasoning: string; opened: boolean; ended: boolean; tools: Map<string, ToolState> };

function nextOrAbort(iterator: AsyncIterator<unknown>, signal: AbortSignal): Promise<IteratorResult<unknown>> {
  if (signal.aborted) return Promise.resolve({ done: true, value: undefined });
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); resolve({ done: true, value: undefined }); };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => iterator.next()).then(
      result => { signal.removeEventListener('abort', onAbort); resolve(result); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

/** Explicit chunks append; only full messages are reconciled as snapshots. */
export async function* adaptDeepAgentStream(
  stream: AsyncIterable<unknown>, fallbackId: string, signal: AbortSignal,
  onAssistantMessage?: (id: string, incomplete: boolean) => void,
): AsyncGenerator<StreamEvent> {
  const messages = new Map<string, MessageState>();
  const results = new Set<string>();
  let fallbackSegment = 1;
  let fallbackBoundary = false;
  const currentFallbackId = () => fallbackSegment === 1 ? fallbackId : `${fallbackId}-${fallbackSegment}`;
  const closeTools = function* (state: MessageState): Generator<StreamEvent> {
    for (const tool of new Set(state.tools.values())) {
      if (tool.started && !tool.ended) {
        tool.ended = true;
        yield { type: 'TOOL_CALL_END', toolCallId: tool.id };
      }
    }
  };
  const closeMessage = function* (id: string): Generator<StreamEvent> {
    const state = messages.get(id)!;
    yield* closeTools(state);
    if (state.opened && !state.ended) {
      state.ended = true;
      yield { type: 'TEXT_MESSAGE_END', messageId: id };
    }
  };
  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (!signal.aborted) {
      const result = await nextOrAbort(iterator, signal);
      if (result.done) break;
      const item = result.value;
      if (signal.aborted) return;
      for (const original of messagesOf(item)) {
        const serializedType = Array.isArray(original.id) ? String(original.id.at(-1)) : '';
        const message = original.type === 'constructor' ? rec(original.kwargs) : original;
        const role = String(message.role ?? message.type ?? (serializedType.startsWith('AIMessage') ? 'ai' : serializedType.startsWith('ToolMessage') ? 'tool' : '')).toLowerCase();
        const suppliedId = typeof message.id === 'string' && message.id.length > 0 ? message.id : undefined;
        if (role === 'tool' || message.tool_call_id) {
          const id = suppliedId ?? `${fallbackId}-result-${String(message.tool_call_id ?? results.size + 1)}`;
          const toolCallId = String(message.tool_call_id ?? id);
          for (const [parentId, state] of messages) {
            if ([...state.tools.values()].some(tool => tool.id === toolCallId)) yield* closeMessage(parentId);
          }
          if (messages.has(currentFallbackId())) yield* closeMessage(currentFallbackId());
          fallbackBoundary = true;
          if (!results.has(toolCallId)) {
            results.add(toolCallId);
            yield { type: 'TOOL_CALL_RESULT', messageId: id, toolCallId, content: textOf(message.content), role: 'tool' };
            yield { type: 'CUSTOM', name: 'h3.tool.status', value: { toolCallId, status: message.status === 'error' ? 'failed' : 'complete', summary: textOf(message.content).slice(0, 240) } };
          }
          continue;
        }
        if (!['assistant', 'ai', 'aimessagechunk', 'ai_chunk'].includes(role)) continue;
        if (!suppliedId && fallbackBoundary) { fallbackSegment++; fallbackBoundary = false; }
        const id = suppliedId ?? currentFallbackId();
        const finishReason = message.response_metadata?.finish_reason ?? message.response_metadata?.stop_reason;
        onAssistantMessage?.(id, ['length', 'max_tokens', 'content_filter', 'error', 'cancelled'].includes(String(finishReason)));
        let state = messages.get(id);
        if (!state) {
          state = { text: '', reasoning: '', opened: false, ended: false, tools: new Map() };
          messages.set(id, state);
        }
        const chunk = AIMessageChunk.isInstance(original) || serializedType === 'AIMessageChunk' || 'tool_call_chunks' in message || ['aimessagechunk', 'ai_chunk'].includes(role);
        const reasoning = reasoningOf(message);
        const snapshotReasoning = !chunk || message.additional_kwargs?.reasoning_content_mode === 'snapshot';
        // Reasoning is display-only: incompatible snapshots must not discard text or tools.
        const reasoningDelta = snapshotReasoning ? (reasoning.startsWith(state.reasoning) ? reasoning.slice(state.reasoning.length) : '') : reasoning;
        if (reasoningDelta) {
          state.reasoning += reasoningDelta;
          yield { type: 'CUSTOM', name: 'h3.reasoning', value: { messageId: id, delta: reasoningDelta } };
        }
        const chunks = message.tool_call_chunks;
        const rawChunks = chunk && Array.isArray(chunks) && chunks.length > 0;
        const calls = rawChunks ? chunks : message.tool_calls ?? message.additional_kwargs?.tool_calls ?? [];
        for (const [position, rawCall] of calls.entries()) {
          const call = rec(rawCall);
          const indexKey = call.index != null ? `index:${call.index}` : !call.id ? `index:${position}` : '';
          const idKey = call.id ? `id:${call.id}` : '';
          let tool = (idKey && state.tools.get(idKey)) || (indexKey && state.tools.get(indexKey));
          if (!tool) tool = { id: String(call.id ?? ''), name: '', args: '', started: false, ended: false };
          if (indexKey) state.tools.set(indexKey, tool);
          if (idKey) state.tools.set(idKey, tool);
          if (tool.ended && rawChunks) continue;
          if (call.id) tool.id = String(call.id);
          if (call.name ?? call.function?.name) tool.name = String(call.name ?? call.function.name);
          const value = call.args ?? call.function?.arguments ?? (rawChunks ? '' : {});
          const args = typeof value === 'string' ? value : JSON.stringify(value);
          const prior = tool.args;
          // LangChain's parsed tool_calls on a chunk may contain partial {}. Raw
          // tool_call_chunks are authoritative whenever supplied by the provider.
          let delta = rawChunks ? args : args.startsWith(prior) ? args.slice(prior.length) : args;
          if (!rawChunks && prior && !args.startsWith(prior)) {
            // A full LangChain message reparses raw JSON, dropping whitespace.
            // That is a snapshot of already emitted arguments, not another call.
            try {
              if (JSON.stringify(JSON.parse(prior)) === JSON.stringify(JSON.parse(args))) delta = '';
            } catch { /* A still-incomplete raw prefix is handled below. */ }
            if (delta) throw new Error(`Tool argument snapshot conflicts with streamed arguments for ${tool.id}`);
          }
          if (tool.ended) {
            if (delta) throw new Error(`Tool argument snapshot conflicts with streamed arguments for ${tool.id}`);
            continue;
          }
          tool.args += delta;
          if (!tool.started && tool.id && tool.name) {
            tool.started = true;
            yield { type: 'TOOL_CALL_START', toolCallId: tool.id, toolCallName: tool.name, parentMessageId: id };
            if (tool.args) yield { type: 'TOOL_CALL_ARGS', toolCallId: tool.id, delta: tool.args };
          } else if (tool.started && delta) yield { type: 'TOOL_CALL_ARGS', toolCallId: tool.id, delta };
        }
        if (!chunk) yield* closeTools(state);
        const text = textOf(message.content);
        if (!chunk && state.text && !text.startsWith(state.text)) throw new Error(`Text snapshot conflicts with streamed text for ${id}`);
        const delta = chunk ? text : text.startsWith(state.text) ? text.slice(state.text.length) : text;
        if (delta && !state.ended) {
          if (!state.opened) {
            state.opened = true;
            yield { type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' };
          }
          state.text += delta;
          yield { type: 'TEXT_MESSAGE_CONTENT', messageId: id, delta };
        }
        if (message.response_metadata?.finish_reason || message.response_metadata?.stop_reason) {
          yield* closeMessage(id);
          if (!suppliedId) fallbackBoundary = true;
        }
      }
    }
  } finally {
    // A provider may ignore cancellation while next() is blocked. Request
    // cleanup without making local stream closure depend on that provider.
    void Promise.resolve().then(() => iterator.return?.()).catch(() => undefined);
    for (const id of messages.keys()) yield* closeMessage(id);
  }
}
