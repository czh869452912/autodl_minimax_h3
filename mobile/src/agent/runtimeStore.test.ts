import { createPromptRuntimeRegistry } from './runtimeStore';
import type { LocalThreadSnapshot, LocalThreadStore } from './threadStore';

const config = { apiKey: 'key', endpoint: 'https://example.invalid', model: 'h3' };
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
    subscribe(subscriber: typeof subscribers[number]) { subscribers.push(subscriber); return { unsubscribe: () => undefined }; },
    setMessages(messages: unknown[]) { this.messages = messages; },
    setState(state: Record<string, unknown>) { this.state = state; },
  };
}

const store = { save: jest.fn(async () => undefined) } as unknown as LocalThreadStore;

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
});
