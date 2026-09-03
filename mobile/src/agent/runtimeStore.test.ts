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
  const subscribers: Array<{ onMessagesChanged?: (event: { messages: unknown[]; state: Record<string, unknown> }) => void; onStateChanged?: (event: { messages: unknown[]; state: Record<string, unknown> }) => void }> = [];
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
    emitMessages(messages: unknown[], state: Record<string, unknown>) { for (const subscriber of subscribers) subscriber.onMessagesChanged?.({ messages, state }); },
    emitState(messages: unknown[], state: Record<string, unknown>) { for (const subscriber of subscribers) subscriber.onStateChanged?.({ messages, state }); },
  };
}

const store = { save: jest.fn(async () => undefined) } as unknown as LocalThreadStore;
const saveMock = store.save as jest.Mock;

describe('prompt runtime registry', () => {
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
