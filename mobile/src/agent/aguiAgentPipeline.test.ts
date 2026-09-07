jest.mock(require.resolve('uuid', { paths: [require.resolve('@ag-ui/client')] }), () => ({ v4: () => 'test-generated-id' }));
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { H3AgUiAgent } from './aguiAgent';

it('preserves accepted image attachments through the real run input pipeline', async () => {
  let received: any;
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { received = input.messages; } });
  agent.setMessages([{ id: 'u', role: 'user', content: 'image request', attachments: [{ id: 'image', type: 'image', source: { type: 'data', value: 'AQID', mimeType: 'image/png' }, metadata: { displayName: '图片1', attachmentId: 'image' } }] }] as never);
  await agent.runAgent({ runId: 'r' });
  expect(received[0].content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } });
});

it('applies interleaved assistant chunks through the real AbstractAgent pipeline', async () => {
  const agent = new H3AgUiAgent({ stream: async function* () {
    yield new AIMessageChunk({ id: 'a', content: 'A' });
    yield new AIMessageChunk({ id: 'b', content: 'B' });
    yield new AIMessageChunk({ id: 'a', content: 'C' });
  } });
  await agent.runAgent();
  expect(agent.messages.map(message => [message.id, message.content])).toEqual([['a', 'AC'], ['b', 'B']]);
});

it('closes started streams immediately on abort and suppresses late provider events', async () => {
  let blocked!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { blocked = resolve; });
  const events: any[] = [];
  const agent = new H3AgUiAgent({ stream: async function* () {
    yield new AIMessageChunk({ id: 'partial', content: 'retained', tool_call_chunks: [{ id: 'call', name: 'read_file', args: '{' }] });
    blocked();
    await new Promise<void>(resolve => { release = resolve; });
    yield new AIMessageChunk({ id: 'late', content: 'must not appear' });
  } });
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const run = agent.runAgent({ runId: 'abort-run' }, { onEvent: ({ event }) => { events.push(event); } });
  try {
    await waiting;
    agent.abortRun();
    agent.abortRun();
    await run;
    expect(agent.isRunning).toBe(false);
    expect(events.slice(-4)).toMatchObject([
      { type: 'TOOL_CALL_END', toolCallId: 'call' },
      { type: 'TEXT_MESSAGE_END', messageId: 'partial' },
      { type: 'CUSTOM', name: 'h3.run.cancelled' },
      { type: 'RUN_ERROR', code: 'abort' },
    ]);
    expect(events.filter(event => event.type === 'RUN_ERROR')).toHaveLength(1);
    expect(agent.messages.find(message => message.id === 'partial')?.content).toBe('retained');
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(agent.messages.some(message => message.id === 'late')).toBe(false);
  } finally { release(); await run.catch(() => undefined); errors.mockRestore(); }
});

it.each([false, true])('retains earlier failed partial output in model history, retry=%s', async (retry) => {
  let received: any;
  const history = [
    { id: 'u1', role: 'user', content: 'first' },
    { id: 'a1', role: 'assistant', content: 'failed partial' },
    { id: 'u2', role: 'user', content: 'second' },
    { id: 'a2', role: 'assistant', content: 'second partial' },
  ];
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { received = input.messages; } }, {
    threadId: 'thread', initialMessages: history as never,
    initialState: { h3Runs: [
      { id: 'r1', userMessageId: 'u1', status: 'failed', messageIds: ['a1'], tools: [], startedAt: 1 },
      { id: 'r2', userMessageId: 'u2', status: 'failed', messageIds: ['a2'], tools: [], startedAt: 2 },
    ] },
  });
  if (retry) agent.prepareRetry('r2');
  await agent.runAgent({ runId: 'new' });
  expect(received.map((message: any) => message.id)).toEqual(retry ? ['u1', 'a1', 'u2'] : ['u1', 'a1', 'u2', 'a2']);
  expect(agent.messages).toEqual(history);
});

it('clones thread messages and state without sharing mutable data or live controls', async () => {
  const agent = new H3AgUiAgent({ stream: async function* () {} }, {
    threadId: 'original-thread', initialMessages: [{ id: 'u', role: 'user', content: 'original' }], initialState: { nested: { value: 1 } },
  });
  const clone = agent.clone();
  expect(clone.threadId).toBe('original-thread');
  expect(clone.messages).toEqual(agent.messages);
  expect(clone.state).toEqual(agent.state);
  expect(clone.isRunning).toBe(false);
  expect((clone as any).abortController).toBeNull();
  expect((clone as any).cancelCurrentRun).toBeUndefined();
  (clone.state as any).nested.value = 2;
  clone.messages[0].content = 'changed';
  expect((agent.state as any).nested.value).toBe(1);
  expect(agent.messages[0].content).toBe('original');
  await clone.runAgent();
});

it('preserves partial text and balances stream events when a full snapshot conflicts', async () => {
  const events: any[] = [];
  const agent = new H3AgUiAgent({ stream: async function* () {
    yield new AIMessageChunk({ id: 'a', content: 'original' });
    yield new AIMessage({ id: 'a', content: 'replacement' });
  } });
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await agent.runAgent({}, { onEvent: ({ event }) => { events.push(event); } });
    expect(agent.messages.find(message => message.id === 'a')?.content).toBe('original');
    expect(events.filter(event => event.type === 'TEXT_MESSAGE_END')).toHaveLength(1);
    expect(events.filter(event => event.type === 'RUN_ERROR')).toHaveLength(1);
    expect(events.some(event => event.type === 'RUN_FINISHED')).toBe(false);
    expect(agent.isRunning).toBe(false);
  } finally { errors.mockRestore(); }
});

it.each(['original', 'clone'])('isolates concurrent original and clone runs when aborting the %s', async (cancelled) => {
  const release: Record<string, () => void> = {};
  const started: Record<string, () => void> = {};
  const ready = Object.fromEntries(['original', 'clone'].map(id => [id, new Promise<void>(resolve => { started[id] = resolve; })]));
  const signals: Record<string, AbortSignal> = {};
  const agent = new H3AgUiAgent({ stream: async function* (input: any, options: any) {
    const id = input.messages.at(-1).id;
    signals[id] = options.signal;
    yield new AIMessageChunk({ id: `${id}-answer`, content: 'partial' });
    started[id]();
    await new Promise<void>(resolve => { release[id] = resolve; });
    yield new AIMessageChunk({ id: `${id}-answer`, content: '-complete' });
  } }, { threadId: 'shared-thread', initialMessages: [{ id: 'original', role: 'user', content: 'original prompt' }] });
  const originalEvents: any[] = [];
  const originalRun = agent.runAgent({}, { onEvent: ({ event }) => { originalEvents.push(event); } });
  await ready.original;
  const clone = agent.clone();
  clone.addMessage({ id: 'clone', role: 'user', content: 'clone prompt' });
  const cloneEvents: any[] = [];
  const cloneRun = clone.runAgent({}, { onEvent: ({ event }) => { cloneEvents.push(event); } });
  try {
    await ready.clone;
    expect(signals.original).not.toBe(signals.clone);
    const stoppedAgent = cancelled === 'original' ? agent : clone;
    const keptAgent = cancelled === 'original' ? clone : agent;
    const keptId = cancelled === 'original' ? 'clone' : 'original';
    stoppedAgent.abortRun();
    await (cancelled === 'original' ? originalRun : cloneRun);
    expect(signals[cancelled].aborted).toBe(true);
    expect(signals[keptId].aborted).toBe(false);
    expect(keptAgent.isRunning).toBe(true);
    release[keptId]();
    await (cancelled === 'original' ? cloneRun : originalRun);
    expect(keptAgent.messages.find(message => message.id === `${keptId}-answer`)?.content).toBe('partial-complete');
    expect((cancelled === 'original' ? originalEvents : cloneEvents).filter(event => event.type === 'RUN_ERROR')).toMatchObject([{ code: 'abort' }]);
    expect((cancelled === 'original' ? cloneEvents : originalEvents).at(-1).type).toBe('RUN_FINISHED');
  } finally {
    release.original(); release.clone();
    agent.abortRun(); clone.abortRun();
    await Promise.allSettled([originalRun, cloneRun]);
  }
});
