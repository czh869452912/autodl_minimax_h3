jest.mock(require.resolve('uuid', { paths: [require.resolve('@ag-ui/client')] }), () => ({ v4: () => 'test-generated-id' }));
import { EventType } from '@ag-ui/core';
import type { RunAgentInput } from '@ag-ui/client';
import { H3AgUiAgent } from './aguiAgent';

beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

function collect(agent: H3AgUiAgent, input: RunAgentInput): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    agent.run(input).subscribe({ next: (event) => events.push(event), error: reject, complete: () => resolve(events) });
  });
}

it('bridges DeepAgents stream into official AG-UI lifecycle events', async () => {
  let graphInput: any;
  const graph = { stream: async function* (input: any) {
    graphInput = input;
    yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [{ id: 'tool-1', name: 'read_file', args: { path: '/skills/h3-prompt-writing/SKILL.md' } }] }, {}];
    yield [{ id: 'assistant-final', type: 'ai', content: '完成' }, {}];
  } };
  const events = await collect(new H3AgUiAgent(graph as never), { threadId: 't1', runId: 'r1', state: {}, messages: [] } as never);
  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED, EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END, EventType.TEXT_MESSAGE_START, EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END, EventType.STATE_SNAPSHOT, EventType.RUN_FINISHED,
  ]);
  expect(Object.keys(graphInput.files).some((path) => path.startsWith('/skills/'))).toBe(true);
});

it('emits one AG-UI tool lifecycle when DeepAgents repeats a cumulative tool call', async () => {
  const repeatedCall = { id: 'tool-1', name: 'read_file', args: { path: '/skills/h3-prompt-writing/SKILL.md' } };
  const graph = { stream: async function* () {
    yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [repeatedCall] }, {}];
    yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [repeatedCall] }, {}];
    yield [{ id: 'tool-message-1', type: 'tool', tool_call_id: 'tool-1', content: 'skill loaded' }, {}];
  } };

  const events = await collect(new H3AgUiAgent(graph as never), { threadId: 't1', runId: 'r1', state: {}, messages: [] } as never);
  for (const type of [EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT]) {
    expect(events.filter((event) => event.type === type)).toHaveLength(1);
  }
});

it('keeps the official chat message renderable and sends selected images to DeepAgents', async () => {
  let graphInput: any;
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { graphInput = input; } } as never);
  agent.setPendingAttachments([{
    id: 'image-1',
    type: 'image',
    source: { type: 'data', value: 'base64-data', mimeType: 'image/png' },
    filename: 'reference.png',
    status: 'ready',
  }] as never);

  agent.addMessage({ id: 'user-1', role: 'user', content: 'describe this image' } as never);
  expect((agent as any).messages[0]).toMatchObject({
    content: 'describe this image',
    attachments: [{ id: 'image-1', type: 'image', filename: 'reference.png' }],
  });

  await collect(agent, { threadId: 't1', runId: 'r1', state: {}, messages: (agent as any).messages } as never);
  expect(graphInput.messages[0].content).toEqual([
    { type: 'text', text: 'describe this image' },
    {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,base64-data' },
    },
  ]);
});

it('normalizes CopilotKit image parts stored directly in message content', async () => {
  let graphInput: any;
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { graphInput = input; } } as never);
  const message = {
    id: 'persisted-image-1',
    role: 'user',
    content: [
      { type: 'text', text: 'use this reference' },
      { type: 'image', source: { type: 'data', value: 'persisted-base64', mimeType: 'image/png' } },
    ],
  };

  await collect(agent, { threadId: 't1', runId: 'r-content-image', state: {}, messages: [message] } as never);

  expect(graphInput.messages[0].content).toEqual([
    { type: 'text', text: 'use this reference' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,persisted-base64' } },
  ]);
});

it('removes orphan CopilotKit tool results before sending history to DeepAgents', async () => {
  let graphInput: any;
  const graph = { stream: async function* (input: any) { graphInput = input; } };
  const toolResult = {
    id: 'run-tool-call-result',
    toolCallId: 'call_123',
    content: '/skills/README.md',
    tool: 'tool',
  };

  await collect(new H3AgUiAgent(graph as never), {
    threadId: 't1', runId: 'r2', state: {}, messages: [toolResult],
  } as never);

  expect(graphInput.messages).toEqual([]);
});

it('normalizes DeepAgents failures into an Error-backed RUN_ERROR event', async () => {
  const graph = { stream: async function* () { throw new TypeError('provider failed'); } };
  const events = await collect(new H3AgUiAgent(graph as never), { threadId: 't1', runId: 'r1', state: {}, messages: [] } as never);
  expect(events.at(-1)).toMatchObject({ type: EventType.RUN_ERROR, message: 'provider failed', rawEvent: expect.any(Error) });
});

it('completes the AG-UI stream when an in-flight run is aborted', async () => {
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const graph = {
    stream: async function* () {
      await new Promise<void>((resolve) => {
        release = resolve;
        started();
      });
    },
  };
  const agent = new H3AgUiAgent(graph as never);
  const completion = collect(agent, { threadId: 't1', runId: 'r-abort', state: {}, messages: [] } as never);
  await began;
  agent.abortRun();
  release();
  await expect(completion).resolves.toEqual([
    { type: EventType.RUN_STARTED, threadId: 't1', runId: 'r-abort' },
    { type: EventType.CUSTOM, name: 'h3.run.cancelled', value: { runId: 'r-abort' } },
    { type: EventType.RUN_ERROR, code: 'abort', message: 'Run cancelled' },
  ]);
});

const { AIMessage, AIMessageChunk, ToolMessage, coerceMessageLikeToMessage } = require('@langchain/core/messages');
const runInput = { threadId: 't1', runId: 'r-regression', state: {}, messages: [] } as never;

it('appends repeated real LangChain chunks verbatim and reconciles a full message', async () => {
  const graph = { stream: async function* () {
    for (const content of ['ha', 'ha', '!', '\n', '\n', '尾']) {
      yield [new AIMessageChunk({ id: 'answer', content }), {}];
    }
    yield [new AIMessage({ id: 'answer', content: 'haha!\n\n尾' }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.filter(e => e.type === 'TEXT_MESSAGE_CONTENT').map(e => e.delta).join('')).toBe('haha!\n\n尾');
});

it('streams parallel raw tool arguments until finish, then emits results separately', async () => {
  const observed: any[] = [];
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'model-1', content: '', tool_call_chunks: [
      { id: 'read-a', name: 'read_file', index: 0, args: '{"file_' },
      { id: 'read-b', name: 'read_file', index: 1, args: '{"file_path":"/b' },
    ] }), {}];
    expect(observed.filter(e => e.type === 'TOOL_CALL_END')).toHaveLength(0);
    yield [new AIMessageChunk({ id: 'model-1', content: '', tool_call_chunks: [
      { index: 1, args: '.md"}' }, { index: 0, args: 'path":"/a.md"}' },
    ] }), {}];
    expect(observed.filter(e => e.type === 'TOOL_CALL_END')).toHaveLength(0);
    yield [new AIMessageChunk({ id: 'model-1', content: '', response_metadata: { finish_reason: 'tool_calls' } }), {}];
    expect(observed.filter(e => e.type === 'TOOL_CALL_END')).toHaveLength(2);
    yield [new ToolMessage({ id: 'result-a', tool_call_id: 'read-a', content: 'A' }), {}];
  } };
  await new Promise<void>((resolve, reject) => new H3AgUiAgent(graph).run(runInput).subscribe({ next: e => observed.push(e), error: reject, complete: resolve }));
  expect(observed.at(-1)).toMatchObject({ type: 'RUN_ERROR', code: 'empty_output' });
  for (const [id, args] of [['read-a', '{"file_path":"/a.md"}'], ['read-b', '{"file_path":"/b.md"}']]) {
    const events = observed.filter(e => e.toolCallId === id);
    expect(events.filter(e => e.type === 'TOOL_CALL_ARGS').map(e => e.delta).join('')).toBe(args);
    expect(events.filter(e => e.type === 'TOOL_CALL_START')).toHaveLength(1);
    expect(events.filter(e => e.type === 'TOOL_CALL_END')).toHaveLength(1);
  }
  expect(observed.findIndex(e => e.type === 'TOOL_CALL_RESULT')).toBeGreaterThan(observed.findIndex(e => e.type === 'TOOL_CALL_END'));
});

it.each(['message boundary', 'tool result', 'stream end'])('ends chunk arguments at %s without finish metadata', async (boundary) => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'model-1', content: '', tool_call_chunks: [{ id: 'call-1', name: 'read_file', index: 0, args: '{"path":' }] }), {}];
    yield [new AIMessageChunk({ id: 'model-1', content: '', tool_call_chunks: [{ index: 0, args: '"/a"}' }] }), {}];
    if (boundary === 'message boundary') yield [new AIMessageChunk({ id: 'model-2', content: 'done' }), {}];
    if (boundary === 'tool result') yield [new ToolMessage({ id: 'result', tool_call_id: 'call-1', content: 'ok' }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  const args = events.filter(e => e.type === 'TOOL_CALL_ARGS');
  expect(args.map(e => e.delta).join('')).toBe('{"path":"/a"}');
  expect(events.filter(e => e.type === 'TOOL_CALL_END')).toHaveLength(1);
  expect(events.findIndex(e => e.type === 'TOOL_CALL_END')).toBeGreaterThan(events.indexOf(args.at(-1)));
});

it('replays persisted AG-UI calls and paired results into actual LangChain messages', async () => {
  let received: any[] = [];
  const graph = { stream: async function* (input: any) { received = input.messages.map(coerceMessageLikeToMessage); } };
  const history = JSON.parse(JSON.stringify([
    { id: 'assistant-tools', role: 'assistant', content: '', toolCalls: [
      { id: 'read-a', type: 'function', function: { name: 'read_file', arguments: '{"path":"/a"}' } },
      { id: 'read-b', type: 'function', function: { name: 'read_file', arguments: '{"path":"/b"}' } },
    ] },
    { id: 'result-a', role: 'tool', toolCallId: 'read-a', content: 'A' },
    { id: 'result-b', tool: 'tool', toolCallId: 'read-b', content: 'B' },
    { id: 'follow-up', role: 'user', content: 'revise it' },
  ]));
  await collect(new H3AgUiAgent(graph), { ...runInput as any, messages: history });
  expect(received[0].tool_calls).toEqual([
    { id: 'read-a', name: 'read_file', args: { path: '/a' }, type: 'tool_call' },
    { id: 'read-b', name: 'read_file', args: { path: '/b' }, type: 'tool_call' },
  ]);
  expect(received.slice(1, 3).map(m => [m.getType(), m.tool_call_id, m.content])).toEqual([['tool', 'read-a', 'A'], ['tool', 'read-b', 'B']]);
});

it('marks only the last tool-free assistant text complete after successful execution', async () => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'thinking', content: 'looking', tool_call_chunks: [{ id: 'call', name: 'read_file', index: 0, args: '{}' }] }), {}];
    yield [new ToolMessage({ id: 'result', tool_call_id: 'call', content: 'ok' }), {}];
    yield [new AIMessageChunk({ id: 'draft', content: 'draft' }), {}];
    yield [new AIMessageChunk({ id: 'final', content: 'final answer' }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), { ...runInput as any, state: { keep: 'state', h3CompletedMessageIds: ['old'] } });
  expect(events.at(-2)).toEqual({ type: 'STATE_SNAPSHOT', snapshot: { h3CompletedMessageIds: ['old', 'final'] } });
  expect(events.at(-1).type).toBe('RUN_FINISHED');
});

it.each(['error', 'cancel'])('does not certify partial output on %s', async (outcome) => {
  let agent: H3AgUiAgent;
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'partial', content: 'partial' }), {}];
    if (outcome === 'error') throw new Error('expected failure');
    agent.abortRun();
  } };
  agent = new H3AgUiAgent(graph);
  const events = await collect(agent, runInput);
  expect(events.some(e => e.type === 'STATE_SNAPSHOT' || e.type === 'RUN_FINISHED')).toBe(false);
});

it.each(['empty', 'tools only', 'tool after text'])('does not add completion IDs for %s runs', async (kind) => {
  const graph = { stream: async function* () {
    if (kind === 'tool after text') yield [new AIMessageChunk({ id: 'answer', content: 'planning' }), {}];
    if (kind !== 'empty') yield [new AIMessageChunk({ id: 'answer', content: '', tool_call_chunks: [{ id: 'call', name: 'read_file', index: 0, args: '{}' }] }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), { ...runInput as any, state: { h3CompletedMessageIds: ['old'] } });
  expect(events.at(-2)).toEqual({ type: 'STATE_SNAPSHOT', snapshot: { h3CompletedMessageIds: ['old'] } });
});

it('keeps parallel tool calls separate when fragments are identified by ID without index', async () => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'model', content: '', tool_call_chunks: [{ id: 'a', name: 'read_file', args: '{"path":' }] }), {}];
    yield [new AIMessageChunk({ id: 'model', content: '', tool_call_chunks: [{ id: 'b', name: 'read_file', args: '{"path":' }] }), {}];
    yield [new AIMessageChunk({ id: 'model', content: '', tool_call_chunks: [{ id: 'a', args: '"/a"}' }, { id: 'b', args: '"/b"}' }] }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.filter(e => e.type === 'TOOL_CALL_START').map(e => e.toolCallId)).toEqual(['a', 'b']);
  expect(events.filter(e => e.type === 'TOOL_CALL_ARGS' && e.toolCallId === 'a').map(e => e.delta).join('')).toBe('{"path":"/a"}');
  expect(events.filter(e => e.type === 'TOOL_CALL_ARGS' && e.toolCallId === 'b').map(e => e.delta).join('')).toBe('{"path":"/b"}');
});

it('labels persisted image identities immediately before their model image parts', async () => {
  let received: any;
  const graph = { stream: async function* (input: any) { received = input.messages[0].content; } };
  await collect(new H3AgUiAgent(graph), { ...runInput as any, messages: [{
    role: 'user', content: [
      { type: 'text', text: 'compare @图片2 and @图片3' },
      { type: 'image', source: { type: 'url', value: 'https://example.test/b.png' }, metadata: { attachmentId: 'b', displayName: '图片2' } },
    ], attachments: [{ id: 'c', type: 'image', source: { type: 'data', value: 'image-c', mimeType: 'image/png' }, metadata: { attachmentId: 'c', displayName: '图片3' } }],
  }] });
  expect(received).toEqual([
    { type: 'text', text: 'compare @图片2 and @图片3' },
    { type: 'text', text: '参考图 @图片2' },
    { type: 'image_url', image_url: { url: 'https://example.test/b.png' } },
    { type: 'text', text: '参考图 @图片3' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,image-c' } },
  ]);
});

it('consumes pending image identities once for provider and gallery images', () => {
  const agent = new H3AgUiAgent({ stream: async function* () {} });
  agent.setPendingImageIdentities([{ attachmentId: 'b', displayName: '图片2' }, { attachmentId: 'c', displayName: '图片3' }]);
  agent.setPendingAttachments([{ id: 'c', type: 'image', source: { type: 'data', value: 'c', mimeType: 'image/png' }, status: 'ready' }] as never);
  agent.addMessage({ id: 'user', role: 'user', content: [
    { type: 'text', text: 'use @图片2 and @图片3' },
    { type: 'image', source: { type: 'data', value: 'b', mimeType: 'image/png' } },
  ] } as never);
  const message = (agent as any).messages[0];
  expect(message.content[1].metadata).toMatchObject({ attachmentId: 'b', displayName: '图片2' });
  expect(message.attachments[0].metadata).toMatchObject({ attachmentId: 'c', displayName: '图片3' });
  agent.addMessage({ id: 'next', role: 'user', content: [{ type: 'image', source: { type: 'data', value: 'd' } }] } as never);
  expect((agent as any).messages[1].content[0].metadata?.attachmentId).not.toBe('b');
});

it('consumes image identities when there are no gallery attachments, and clears pending identities on dispose', () => {
  const agent = new H3AgUiAgent({ stream: async function* () {} });
  const message = { id: 'provider', role: 'user', content: [{ type: 'image', source: { type: 'url', value: 'https://example.test/b.png' } }] };
  agent.setPendingImageIdentities([{ attachmentId: 'b', displayName: '图片2' }]);
  agent.addMessage(message as never);
  expect((agent as any).messages[0].content[0].metadata).toMatchObject({ attachmentId: 'b', displayName: '图片2' });
  agent.setPendingImageIdentities([{ attachmentId: 'stale', displayName: '图片9' }]);
  agent.dispose();
  agent.addMessage({ ...message, id: 'after-dispose' } as never);
  expect((agent as any).messages[1].content[0].metadata?.attachmentId).not.toBe('stale');
});

it('does not append a parsed full tool snapshot after complete raw JSON with whitespace', async () => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'model', content: '', tool_call_chunks: [{ id: 'a', name: 'read_file', index: 0, args: '{ "path": "/a" }' }] }), {}];
    yield [new AIMessage({ id: 'model', content: '', tool_calls: [{ id: 'a', name: 'read_file', args: { path: '/a' } }] }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.filter(e => e.type === 'TOOL_CALL_ARGS').map(e => e.delta).join('')).toBe('{ "path": "/a" }');
  expect(events.filter(e => e.type === 'TOOL_CALL_END')).toHaveLength(1);
});

it.each(['length', 'content_filter', 'max_tokens'])('does not certify model output cut short by %s', async (reason) => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'partial', content: 'cut off output' }), {}];
    yield [new AIMessageChunk({ id: 'partial', content: '', response_metadata: { finish_reason: reason } }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.find(e => e.type === 'STATE_SNAPSHOT').snapshot.h3CompletedMessageIds).toEqual([]);
  expect(events.find(e => e.type === 'RUN_ERROR')).toMatchObject({ code: reason === 'content_filter' ? 'content_filter' : 'output_limit' });
  expect(events.some(e => e.type === 'RUN_FINISHED')).toBe(false);
});

it('does not certify earlier text when the final model message has no text', async () => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'intermediate', content: 'thinking' }), {}];
    yield [new AIMessage({ id: 'final', content: '' }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.find(e => e.type === 'STATE_SNAPSHOT').snapshot.h3CompletedMessageIds).toEqual([]);
  expect(events.find(e => e.type === 'RUN_ERROR')).toMatchObject({ code: 'empty_output' });
  expect(events.some(e => e.type === 'RUN_FINISHED')).toBe(false);
});

it.each(['length', 'stop', undefined])('reports reasoning-only completion with finish reason %s', async reason => {
  const graph = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'reasoning-only', content: '', additional_kwargs: { reasoning_content: 'Inspect reference' } }), {}];
    yield [new AIMessageChunk({ id: 'reasoning-only', content: '', response_metadata: { finish_reason: reason } }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph, {}, { budget: { inputTokens: 28672, outputTokens: 4096 } }), runInput);
  expect(events.find(e => e.type === 'RUN_ERROR')).toMatchObject({ code: reason === 'length' ? 'output_limit' : 'empty_output' });
  if (reason === 'length') expect(events.at(-1).message).toContain('4096');
  expect(events.some(e => e.type === 'RUN_FINISHED')).toBe(false);
  expect(events.find(e => e.type === 'CUSTOM' && e.name === 'h3.reasoning').value.delta).toBe('Inspect reference');
});

it('does not certify whitespace as a final response', async () => {
  const graph = { stream: async function* () { yield [new AIMessage({ id: 'blank', content: ' \n ', response_metadata: { finish_reason: 'stop' } }), {}]; } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.at(-1)).toMatchObject({ type: 'RUN_ERROR', code: 'empty_output' });
});

it('allows a new follow-up after cancelled raw arguments while preserving valid paired history', async () => {
  let cancelledAgent: H3AgUiAgent;
  const cancelled = { stream: async function* () {
    yield [new AIMessageChunk({ id: 'cancelled-model', content: '', tool_call_chunks: [{ id: 'partial-call', name: 'read_file', index: 0, args: '{"path":' }] }), {}];
    cancelledAgent.abortRun();
  } };
  cancelledAgent = new H3AgUiAgent(cancelled);
  const partialEvents = await collect(cancelledAgent, runInput);
  const partialArgs = partialEvents.filter(e => e.type === 'TOOL_CALL_ARGS').map(e => e.delta).join('');
  let received: any[] = [];
  const nextGraph = { stream: async function* (input: any) { received = input.messages.map(coerceMessageLikeToMessage); yield [new AIMessage({ id: 'followup', content: 'Final answer' }), {}]; } };
  const events = await collect(new H3AgUiAgent(nextGraph), { ...runInput as any, messages: [
    { role: 'assistant', content: 'read a skill', toolCalls: [{ id: 'valid-call', type: 'function', function: { name: 'read_file', arguments: '{"path":"/skill"}' } }] },
    { role: 'tool', toolCallId: 'valid-call', content: 'skill contents' },
    { role: 'assistant', content: 'interrupted planning', toolCalls: [{ id: 'partial-call', type: 'function', function: { name: 'read_file', arguments: partialArgs } }] },
    { role: 'user', content: 'new follow-up' },
  ] });
  expect(events.some(e => e.type === 'RUN_ERROR')).toBe(false);
  expect(received[0].tool_calls).toEqual([{ id: 'valid-call', name: 'read_file', args: { path: '/skill' }, type: 'tool_call' }]);
  expect(received[1].tool_call_id).toBe('valid-call');
  expect(received[1].content).toBe('skill contents');
  expect(received[2].tool_calls).toEqual([]);
  expect(received[2].content).toBe('interrupted planning');
  expect(received[3].content).toBe('new follow-up');
});

it('retries an identified original user input without deleting any displayed attempts', async () => {
  let graphInput: any;
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { graphInput = input; } });
  const history = [
    { id: 'u1', role: 'user', content: 'original', attachments: [{ id: 'img', type: 'image', source: { type: 'url', value: 'https://example.test/img.png' } }] },
    { id: 'a1', role: 'assistant', content: 'failed partial' },
    { id: 'u2', role: 'user', content: 'later input' },
  ];
  (agent as any).messages = history;
  (agent as any).state = { h3Runs: [{ id: 'failed-1', userMessageId: 'u1', status: 'failed', startedAt: 1, messageIds: ['a1'], tools: [] }] };
  agent.prepareRetry('failed-1');
  expect(agent.getPreparedRetry()).toMatchObject({ retryOf: 'failed-1', userMessageId: 'u1' });
  await collect(agent, { ...runInput as any, state: (agent as any).state, messages: history });
  expect(graphInput.messages).toHaveLength(1);
  expect(graphInput.messages[0].content[0].text).toBe('original');
  expect(graphInput.messages[0].content[1].image_url.url).toBe('https://example.test/img.png');
  expect(agent.messages).toEqual(history);
  expect(agent.getPreparedRetry()).toBeUndefined();
});

it('removes valid but unexecuted tool calls from future model history', async () => {
  let graphInput: any;
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { graphInput = input; } });
  await collect(agent, { ...runInput as any, messages: [
    { id: 'a', role: 'assistant', content: 'partial', toolCalls: [{ id: 'abandoned', function: { name: 'read_file', arguments: '{}' } }] },
    { id: 'u', role: 'user', content: 'follow up' },
  ] });
  expect(graphInput.messages[0].tool_calls).toEqual([]);
});

it('uses ToolMessage status for tool failure without interpreting text', async () => {
  const graph = { stream: async function* () {
    yield [new ToolMessage({ id: 'result-1', tool_call_id: 't1', content: 'Error is a word in this successful file', status: 'success' }), {}];
    yield [new ToolMessage({ id: 'result-2', tool_call_id: 't2', content: 'cannot open', status: 'error' }), {}];
  } };
  const events = await collect(new H3AgUiAgent(graph), runInput);
  expect(events.filter(event => event.type === 'CUSTOM').map(event => event.value)).toEqual([
    { toolCallId: 't1', status: 'complete', summary: 'Error is a word in this successful file' },
    { toolCallId: 't2', status: 'failed', summary: 'cannot open' },
  ]);
});
