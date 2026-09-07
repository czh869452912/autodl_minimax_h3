import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { adaptDeepAgentStream, type StreamEvent } from './deepAgentStream';

async function collect(items: unknown[]) {
  const events: StreamEvent[] = [];
  let error: unknown;
  try {
    for await (const event of adaptDeepAgentStream((async function* () { yield* items; })(), 'fallback', new AbortController().signal)) events.push(event);
  } catch (cause) { error = cause; }
  return { events, error };
}

it('retains interleaved A/B/A chunks with one lifecycle per message', async () => {
  const { events, error } = await collect([
    new AIMessageChunk({ id: 'a', content: 'A' }),
    new AIMessageChunk({ id: 'b', content: 'B' }),
    new AIMessageChunk({ id: 'a', content: 'C' }),
  ]);
  expect(error).toBeUndefined();
  for (const [id, text] of [['a', 'AC'], ['b', 'B']]) {
    expect(events.filter(e => e.type === 'TEXT_MESSAGE_CONTENT' && e.messageId === id).map(e => (e as any).delta).join('')).toBe(text);
    expect(events.filter(e => e.type === 'TEXT_MESSAGE_START' && e.messageId === id)).toHaveLength(1);
    expect(events.filter(e => e.type === 'TEXT_MESSAGE_END' && e.messageId === id)).toHaveLength(1);
  }
});

it('rejects conflicting full text snapshots and closes the emitted partial text', async () => {
  const { events, error } = await collect([new AIMessageChunk({ id: 'a', content: 'original' }), new AIMessage({ id: 'a', content: 'replacement' })]);
  expect(error).toEqual(expect.objectContaining({ message: expect.stringMatching(/text snapshot conflicts.*a/i) }));
  expect(events.filter(e => e.type === 'TEXT_MESSAGE_CONTENT').map(e => (e as any).delta)).toEqual(['original']);
  expect(events.at(-1)).toEqual({ type: 'TEXT_MESSAGE_END', messageId: 'a' });
});

it('segments missing IDs deterministically after tool results and finish metadata', async () => {
  const items = [
    { type: 'ai_chunk', content: 'before', tool_call_chunks: [{ id: 'call', name: 'read_file', args: '{}' }] },
    new ToolMessage({ tool_call_id: 'call', content: 'result' }),
    { type: 'ai_chunk', content: 'after', response_metadata: { finish_reason: 'stop' } },
    { type: 'ai_chunk', content: 'third' },
  ];
  const { events, error } = await collect(items);
  expect(error).toBeUndefined();
  expect(events.filter(e => e.type === 'TEXT_MESSAGE_CONTENT').map(e => [(e as any).messageId, (e as any).delta])).toEqual([
    ['fallback', 'before'], ['fallback-2', 'after'], ['fallback-3', 'third'],
  ]);
  expect((await collect(items)).events).toEqual(events);
});

it('closes all started streams when the source throws', async () => {
  const events: StreamEvent[] = [];
  const source = (async function* () {
    yield new AIMessageChunk({ id: 'a', content: 'partial', tool_call_chunks: [{ id: 'call', name: 'read_file', args: '{' }] });
    throw new Error('offline');
  })();
  await expect((async () => { for await (const event of adaptDeepAgentStream(source, 'fallback', new AbortController().signal)) events.push(event); })()).rejects.toThrow('offline');
  expect(events.slice(-2)).toEqual([{ type: 'TOOL_CALL_END', toolCallId: 'call' }, { type: 'TEXT_MESSAGE_END', messageId: 'a' }]);
});

it('ends a blocked adapter iterator on abort without waiting for the provider', async () => {
  let release!: () => void;
  const controller = new AbortController();
  const source = (async function* () {
    yield new AIMessageChunk({ id: 'a', content: 'partial' });
    await new Promise<void>(resolve => { release = resolve; });
    yield new AIMessageChunk({ id: 'late', content: 'late' });
  })();
  const adapted = adaptDeepAgentStream(source, 'fallback', controller.signal);
  expect((await adapted.next()).value?.type).toBe('TEXT_MESSAGE_START');
  expect((await adapted.next()).value?.type).toBe('TEXT_MESSAGE_CONTENT');
  const pending = adapted.next();
  await Promise.resolve();
  controller.abort();
  try {
    const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve('blocked'), 50))]);
    expect(result).toEqual({ done: false, value: { type: 'TEXT_MESSAGE_END', messageId: 'a' } });
    expect((await adapted.next()).done).toBe(true);
  } finally { release(); await pending; }
});

it.each(['finish', 'full message'])('rejects conflicting argument snapshots after a tool ends via %s', async (boundary) => {
  const first = new AIMessageChunk({ id: 'a', content: '', tool_call_chunks: [{ id: 'call', name: 'read_file', args: '{"path":"/a"}' }] });
  const end = boundary === 'finish'
    ? new AIMessageChunk({ id: 'a', content: '', response_metadata: { finish_reason: 'tool_calls' } })
    : new AIMessage({ id: 'a', content: '', tool_calls: [{ id: 'call', name: 'read_file', args: { path: '/a' } }] });
  const { events, error } = await collect([first, end, new AIMessage({ id: 'a', content: '', tool_calls: [{ id: 'call', name: 'read_file', args: { path: '/b' } }] })]);
  expect(error).toEqual(expect.objectContaining({ message: expect.stringMatching(/tool argument snapshot conflicts.*call/i) }));
  expect(events.filter(event => event.type === 'TOOL_CALL_ARGS').map(event => (event as any).delta)).toEqual(['{"path":"/a"}']);
  expect(events.filter(event => event.type === 'TOOL_CALL_START')).toHaveLength(1);
  expect(events.filter(event => event.type === 'TOOL_CALL_END')).toHaveLength(1);
});

it('accepts equivalent argument snapshots after tool end without reopening the lifecycle', async () => {
  const { events, error } = await collect([
    new AIMessageChunk({ id: 'a', content: '', tool_call_chunks: [{ id: 'call', name: 'read_file', args: '{ "path": "/a" }' }], response_metadata: { finish_reason: 'tool_calls' } }),
    new AIMessage({ id: 'a', content: '', tool_calls: [{ id: 'call', name: 'read_file', args: { path: '/a' } }] }),
  ]);
  expect(error).toBeUndefined();
  expect(events.filter(event => event.type === 'TOOL_CALL_ARGS')).toHaveLength(1);
  expect(events.filter(event => event.type === 'TOOL_CALL_END')).toHaveLength(1);
});
