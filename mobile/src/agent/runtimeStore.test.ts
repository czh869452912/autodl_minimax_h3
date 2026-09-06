import { createPromptRuntimeRegistry } from './runtimeStore';
import type { LocalThreadSnapshot, LocalThreadStore } from './threadStore';

const config = { apiKey: 'key', endpoint: 'https://example.invalid', model: 'h3', timeoutMs: 600000, maxRetries: 2 };
const snapshot = (threadId: string, updatedAt = 1): LocalThreadSnapshot => ({
  threadId,
  messages: [{ id: `${threadId}-message`, role: 'user', content: 'hello' }] as never,
  state: { phase: 'draft' },
  createdAt: 1,
  updatedAt,
});

function fakeAgent() {
  const subscribers: Array<Record<string, (event: any) => any>> = [];
  return {
    threadId: '',
    messages: [] as unknown[],
    state: {} as Record<string, unknown>,
    isRunning: false,
    abortRun: jest.fn(),
    dispose: jest.fn(function(this: { abortRun(): void }) { this.abortRun(); }),
    subscribe(subscriber: typeof subscribers[number]) { subscribers.push(subscriber); return { unsubscribe: jest.fn(() => { const index = subscribers.indexOf(subscriber); if (index >= 0) subscribers.splice(index, 1); }) }; },
    setMessages(messages: unknown[]) { this.messages = messages; },
    setState(state: Record<string, unknown>) { this.state = state; },
    emit(name: string, payload: any) { for (const subscriber of subscribers) subscriber[name]?.({ messages: this.messages, state: this.state, ...payload }); },
    emitMessages(messages: unknown[], state: Record<string, unknown>) { for (const subscriber of subscribers) subscriber.onMessagesChanged?.({ messages, state }); },
    emitState(messages: unknown[], state: Record<string, unknown>) { for (const subscriber of subscribers) subscriber.onStateChanged?.({ messages, state }); },
  };
}

const store = { save: jest.fn(async () => undefined) } as unknown as LocalThreadStore;
const saveMock = store.save as jest.Mock;

describe('prompt runtime registry', () => {
  it('renames metadata after an in-flight save and preserves later pending output on disposal', async () => {
    let release!: () => void;
    let saved = snapshot('thread-1');
    let block = true;
    const persistence = {
      save: async (next: LocalThreadSnapshot) => {
        if (block) { block = false; await new Promise<void>((resolve) => { release = resolve; }); }
        saved = next;
      },
      rename: async (_id: string, title: string, updatedAt: number) => {
        saved = { ...saved, customTitle: title, updatedAt };
      },
    } as unknown as LocalThreadStore;
    const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
    const runtime = registry.ensure(config, snapshot('thread-1'), persistence);
    const agent = runtime.agent as never as ReturnType<typeof fakeAgent>;
    agent.emitMessages([{ id: 'reply', role: 'assistant', content: 'partial' }], {});
    const saving = runtime.flush();
    await Promise.resolve();
    agent.emitMessages([{ id: 'reply', role: 'assistant', content: 'complete reply' }], {});
    const renaming = registry.renameThread('thread-1', 'My title', persistence);
    release();
    await Promise.all([saving, renaming]);
    registry.ensure(config, snapshot('thread-1'), persistence);
    agent.emitState(runtime.getSnapshot().messages, { phase: 'complete' });
    await registry.disposeAll();
    expect(saved.customTitle).toBe('My title');
    expect(saved.messages).toEqual([{ id: 'reply', role: 'assistant', content: 'complete reply' }]);
    expect(runtime.getSnapshot().customTitle).toBe('My title');
  });

  it('publishes background snapshots and stops publishing an evicted thread', async () => {
    const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
    const seen: LocalThreadSnapshot[] = [];
    registry.subscribe((next) => seen.push(next));
    const first = registry.ensure(config, snapshot('thread-1'), store);
    registry.ensure(config, snapshot('thread-2'), store);
    const agent = first.agent as never as ReturnType<typeof fakeAgent>;
    agent.emitMessages([{ id: 'reply', role: 'assistant', content: 'background complete' }], {});
    expect(seen).toHaveLength(1);
    expect(seen[0].messages).toEqual([{ id: 'reply', role: 'assistant', content: 'background complete' }]);
    await registry.evictThread('thread-1');
    agent.emitMessages([{ id: 'late', role: 'assistant', content: 'late' }], {});
    expect(seen).toHaveLength(1);
    await registry.disposeAll();
  });

  it('reuses a hydrated agent for the same config and thread', () => {
    const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
    const first = registry.ensure(config, snapshot('thread-1'), store);
    const second = registry.ensure(config, snapshot('thread-1', 2), store);
    const otherThread = registry.ensure(config, snapshot('thread-2'), store);

    expect(second.agent).toBe(first.agent);
    expect(first.agent.messages).toHaveLength(1);
    expect(otherThread.agent).not.toBe(first.agent);
  });

  it('creates a new runtime when network settings change', () => {
    const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
    const first = registry.ensure(config, snapshot('thread-1'), store);
    const changed = registry.ensure({ ...config, timeoutMs: 120000 }, snapshot('thread-1'), store);

    expect(changed.agent).not.toBe(first.agent);
  });

  it('coalesces rapid stream events into one latest snapshot save', async () => {
    jest.useFakeTimers();
    try {
      saveMock.mockClear();
      const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
      const runtime = registry.ensure(config, snapshot('thread-1'), store);
      const agent = runtime.agent as never as ReturnType<typeof fakeAgent>;
      for (let index = 0; index < 20; index += 1) {
        agent.emitMessages([{ id: 'message', role: 'assistant', content: String(index) }], { phase: 'running', index });
      }
      expect(saveMock).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(350);
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(saveMock.mock.calls[0][0]).toMatchObject({ messages: [{ content: '19' }], state: { index: 19 } });
    } finally {
      jest.useRealTimers();
    }
  });

  it('hydrates a replacement runtime from the old generation latest snapshot', () => {
    const agents: ReturnType<typeof fakeAgent>[] = [];
    const registry = createPromptRuntimeRegistry(() => {
      const agent = fakeAgent();
      agents.push(agent);
      return agent as never;
    });
    const first = registry.ensure(config, snapshot('thread-1'), store);
    agents[0].emitMessages(
      [{ id: 'latest', role: 'assistant', content: 'streamed' }],
      { phase: 'latest' },
    );

    const replacement = registry.ensure(
      { ...config, model: 'new-model' },
      snapshot('thread-1'),
      store,
    );

    expect(replacement.agent.messages).toEqual([
      { id: 'latest', role: 'assistant', content: 'streamed' },
    ]);
    expect(replacement.agent.state).toEqual({ phase: 'latest' });
    expect(first.disposed()).toBe(true);
  });

  it('revokes the old generation before replacing a thread config', async () => {
    saveMock.mockClear();
    const agents: ReturnType<typeof fakeAgent>[] = [];
    const registry = createPromptRuntimeRegistry(() => { const agent = fakeAgent(); agents.push(agent); return agent as never; });
    const first = registry.ensure(config, snapshot('thread-1'), store);
    registry.ensure({ ...config, model: 'new-model' }, snapshot('thread-1'), store);
    agents[0].emitMessages([{ id: 'late', role: 'assistant', content: 'late' }], {});
    await first.flush();
    expect(agents[0].abortRun).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalledWith(expect.objectContaining({ messages: [{ id: 'late' }] }));
  });

  it('flushes, unsubscribes, and removes every runtime for an evicted thread', async () => {
    saveMock.mockClear();
    const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
    const runtime = registry.ensure(config, snapshot('thread-1'), store);
    (runtime.agent as never as ReturnType<typeof fakeAgent>).emitMessages([{ id: 'm', role: 'user', content: 'saved' }], {});
    await registry.evictThread('thread-1');
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1' }));
    expect(runtime.disposed()).toBe(true);
    expect(registry.size()).toBe(0);
  });
});

it('bounds saves during continuous deltas and flushes all runtimes', async () => {
  jest.useFakeTimers();
  const saved: LocalThreadSnapshot[] = [];
  const persistence = { save: async (s: LocalThreadSnapshot) => { saved.push(s); } } as LocalThreadStore;
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('continuous'), persistence);
  try {
    for (let i = 0; i < 45; i++) {
      (runtime.agent as any).emitMessages([{ id: 'a', role: 'assistant', content: String(i) }], {});
      await jest.advanceTimersByTimeAsync(100);
      if (i === 20) expect(saved.length).toBeGreaterThanOrEqual(1);
      if (i === 40) expect(saved.length).toBeGreaterThanOrEqual(2);
    }
    await registry.flushAll();
    expect(saved.at(-1)?.messages[0].content).toBe('44');
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});

it('retains the newest dirty snapshot after a transient disk failure for explicit retry', async () => {
  let fail = true;
  const saved: LocalThreadSnapshot[] = [];
  const persistence = { save: async (s: LocalThreadSnapshot) => { if (fail) throw new Error('disk busy'); saved.push(s); } } as LocalThreadStore;
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('disk'), persistence);
  (runtime.agent as any).emitMessages([{ id: 'a', role: 'assistant', content: 'latest' }], {});
  await runtime.flush();
  fail = false;
  await runtime.flush();
  expect(saved.at(-1)?.messages[0].content).toBe('latest');
  await registry.disposeAll();
});

it('recovers a cold running attempt and preserves client state over a stale server snapshot', async () => {
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, { ...snapshot('cold'), state: { h3Composer: { text: 'old' }, h3Runs: [{ id: 'run-1', userMessageId: 'cold-message', status: 'running', startedAt: 1, messageIds: ['partial'], tools: [{ id: 't', name: 'read_file', status: 'running', startedAt: 2 }] }] } }, store);
  expect((runtime.getSnapshot().state as any).h3Runs[0]).toMatchObject({ id: 'run-1', status: 'interrupted', userMessageId: 'cold-message', tools: [{ status: 'cancelled' }] });
  runtime.patchClientState({ h3Composer: { text: 'new' }, h3Versions: ['v1'] });
  (runtime.agent as any).emitState(runtime.getSnapshot().messages, { h3Composer: { text: 'old' }, h3Versions: [], phase: 'done', h3Runs: [] });
  expect(runtime.getSnapshot().state).toMatchObject({ h3Composer: { text: 'new' }, h3Versions: ['v1'], phase: 'done', h3Runs: [{ id: 'run-1', status: 'interrupted' }] });
  await registry.disposeAll();
});

it('persists run IDs, real tool outcome, and cancellation without a mounted screen', async () => {
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('lifecycle'), store);
  const agent = runtime.agent as any;
  const input = { runId: 'r1', messages: agent.messages };
  agent.emit('onRunInitialized', { input });
  agent.emit('onEvent', { input, event: { type: 'TOOL_CALL_START', toolCallId: 't1', toolCallName: 'read_file', parentMessageId: 'a1' } });
  agent.emit('onEvent', { input, event: { type: 'TOOL_CALL_END', toolCallId: 't1' } });
  expect((runtime.getSnapshot().state as any).h3Runs[0].tools[0].status).toBe('running');
  agent.emit('onEvent', { input, event: { type: 'CUSTOM', name: 'h3.tool.status', value: { toolCallId: 't1', status: 'failed', summary: 'missing file' } } });
  agent.emit('onEvent', { input, event: { type: 'TEXT_MESSAGE_START', messageId: 'a2' } });
  agent.emit('onEvent', { input, event: { type: 'CUSTOM', name: 'h3.run.cancelled', value: { runId: 'r1' } } });
  agent.emit('onRunFinalized', { input });
  expect((runtime.getSnapshot().state as any).h3Runs[0]).toMatchObject({ id: 'r1', userMessageId: 'lifecycle-message', status: 'cancelled', endedAt: expect.any(Number), messageIds: ['a1', 'a2'], tools: [{ id: 't1', status: 'failed' }] });
  await registry.disposeAll();
});

it('keeps a failed attempt failed after run finalization', async () => {
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('failure'), store);
  const agent = runtime.agent as any;
  const input = { runId: 'failed-id', messages: agent.messages };
  agent.emit('onRunInitialized', { input });
  agent.emit('onRunFailed', { input, error: new Error('offline') });
  agent.emit('onRunFinalized', { input });
  expect((runtime.getSnapshot().state as any).h3Runs[0]).toMatchObject({ id: 'failed-id', status: 'failed', error: 'offline' });
  await registry.disposeAll();
});

it('retries disk failures at a controlled interval with the newest stream snapshot', async () => {
  jest.useFakeTimers();
  let writes = 0;
  let saved: LocalThreadSnapshot | undefined;
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('retry-disk'), { save: async (next: LocalThreadSnapshot) => { writes++; if (writes < 3) throw new Error('busy'); saved = next; } } as LocalThreadStore);
  try {
    (runtime.agent as any).emitMessages([{ id: 'a', role: 'assistant', content: 'first' }], {});
    await runtime.flush();
    await jest.advanceTimersByTimeAsync(1999);
    expect(writes).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(writes).toBe(2);
    (runtime.agent as any).emitMessages([{ id: 'a', role: 'assistant', content: 'newest' }], {});
    await jest.advanceTimersByTimeAsync(2000);
    expect(saved?.messages[0].content).toBe('newest');
    expect(writes).toBe(3);
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});

it('does not let a queued delta debounce bypass the disk failure retry interval', async () => {
  jest.useFakeTimers();
  let rejectSave!: (reason: Error) => void;
  let writes = 0;
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('inflight-fail'), { save: async () => { writes++; if (writes === 1) await new Promise<void>((_resolve, reject) => { rejectSave = reject; }); } } as unknown as LocalThreadStore);
  try {
    (runtime.agent as any).emitMessages([{ id: 'a', role: 'assistant', content: 'first' }], {});
    const flushing = runtime.flush();
    await Promise.resolve();
    (runtime.agent as any).emitMessages([{ id: 'a', role: 'assistant', content: 'newest' }], {});
    rejectSave(new Error('busy'));
    await flushing;
    await jest.advanceTimersByTimeAsync(500);
    expect(writes).toBe(1);
    await jest.advanceTimersByTimeAsync(1500);
    expect(writes).toBe(2);
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});
