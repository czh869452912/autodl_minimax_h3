import type { H3AgUiAgent } from './aguiAgent';
import type { H3AgentConfig } from './agentTypes';
import type { LocalThreadSnapshot, LocalThreadStore } from './threadStore';

export type PromptAgentConfig = H3AgentConfig;

export type RuntimeEvent =
  | { type: 'snapshot'; snapshot: LocalThreadSnapshot }
  | { type: 'error'; message: string };

export type PromptRuntime = {
  agent: H3AgUiAgent;
  getSnapshot: () => LocalThreadSnapshot;
  updateMetadata: (snapshot: LocalThreadSnapshot) => void;
  flush: () => Promise<void>;
  dispose: () => Promise<void>;
  disposed: () => boolean;
  subscribe: (listener: (event: RuntimeEvent) => void) => () => void;
};

type AgentFactory = (config: PromptAgentConfig) => H3AgUiAgent;

function defaultAgentFactory(config: PromptAgentConfig): H3AgUiAgent {
  // Keep the registry's pure lifecycle helpers importable in Jest and other
  // lightweight environments without eagerly loading the DeepAgents bundle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createH3Agent } = require('./h3Agent') as typeof import('./h3Agent');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { H3AgUiAgent } = require('./aguiAgent') as typeof import('./aguiAgent');
  return new H3AgUiAgent(createH3Agent(config) as never);
}

function configKey(config: PromptAgentConfig): string {
  return `${config.endpoint}\u0000${config.model}\u0000${config.apiKey}\u0000${config.timeoutMs}\u0000${config.maxRetries}`;
}

export function createPromptRuntimeRegistry(
  createAgent: AgentFactory = defaultAgentFactory,
) {
  const runtimes = new Map<string, { configKey: string; runtime: PromptRuntime }>();
  const saveTails = new Map<string, Promise<void>>();

  const enqueueSave = (threadId: string, work: () => Promise<void>): Promise<void> => {
    const tail = (saveTails.get(threadId) ?? Promise.resolve()).then(work);
    saveTails.set(threadId, tail.catch(() => undefined));
    return tail;
  };

  return {
    ensure(
      config: PromptAgentConfig,
      initial: LocalThreadSnapshot,
      threadStore: LocalThreadStore,
    ): PromptRuntime {
      const key = configKey(config);
      const existing = runtimes.get(initial.threadId);
      if (existing?.configKey === key) {
        existing.runtime.updateMetadata(initial);
        return existing.runtime;
      }
      const seed = existing
        ? {
            ...initial,
            ...existing.runtime.getSnapshot(),
            customTitle: initial.customTitle ?? existing.runtime.getSnapshot().customTitle,
            createdAt: initial.createdAt,
          }
        : initial;
      if (existing) void existing.runtime.dispose();

      const agent = createAgent(config);
      agent.threadId = seed.threadId;
      agent.setMessages(seed.messages);
      agent.setState(seed.state);
      let snapshot = seed;
      let pendingSave: LocalThreadSnapshot | undefined;
      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      let active = true;
      let disposePromise: Promise<void> | undefined;
      const listeners = new Set<(event: RuntimeEvent) => void>();
      const emit = (event: RuntimeEvent) => {
        if (!active) return;
        for (const listener of listeners) listener(event);
      };
      const persist = (messages: readonly unknown[], state: unknown) => {
        if (!active) return;
        snapshot = {
          ...snapshot,
          messages: [...messages] as never,
          state: { ...(state as Record<string, unknown>) } as never,
          updatedAt: Date.now(),
        };
        emit({ type: 'snapshot', snapshot });
        pendingSave = snapshot;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { void flush(); }, 300);
      };
      const flush = async () => {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined; }
        const next = pendingSave;
        pendingSave = undefined;
        if (!next) return saveTails.get(initial.threadId);
        try {
          await enqueueSave(initial.threadId, () => threadStore.save(next));
        } catch (reason) {
          emit({ type: 'error', message: reason instanceof Error ? `本地会话保存失败：${reason.message}` : '本地会话保存失败' });
        }
        if (active && pendingSave) await flush();
      };
      const subscription = agent.subscribe({
        onMessagesChanged: ({ messages, state }) => persist(messages, state),
        onStateChanged: ({ messages, state }) => persist(messages, state),
      });
      const unsubscribe = () => {
        subscription?.unsubscribe?.();
      };
      const dispose = (): Promise<void> => {
        if (disposePromise) return disposePromise;
        active = false;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined; }
        unsubscribe();
        agent.dispose?.();
        const next = pendingSave;
        pendingSave = undefined;
        disposePromise = (next
          ? enqueueSave(initial.threadId, () => threadStore.save(next))
          : saveTails.get(initial.threadId) ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => { listeners.clear(); });
        return disposePromise;
      };

      const runtime: PromptRuntime = {
        agent,
        getSnapshot: () => snapshot,
        updateMetadata: (next) => {
          if (!active) return;
          snapshot = {
            ...snapshot,
            customTitle: next.customTitle,
            createdAt: next.createdAt,
          };
        },
        flush,
        dispose,
        disposed: () => !active,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      runtimes.set(initial.threadId, { configKey: key, runtime });
      return runtime;
    },
    async evictThread(threadId: string): Promise<void> {
      const entry = runtimes.get(threadId);
      if (!entry) return;
      runtimes.delete(threadId);
      await entry.runtime.dispose();
    },
    async disposeAll(): Promise<void> {
      const entries = [...runtimes.values()];
      runtimes.clear();
      await Promise.all(entries.map((entry) => entry.runtime.dispose()));
    },
    size(): number { return runtimes.size; },
  };
}

export const promptRuntimeRegistry = createPromptRuntimeRegistry();
