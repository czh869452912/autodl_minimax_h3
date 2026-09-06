import { endPromptRun, readPromptRuns, reducePromptRunEvent } from './runState';
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
  updateMetadata: (metadata: Pick<LocalThreadSnapshot, 'customTitle' | 'updatedAt'>) => void;
  patchClientState: (patch: Record<string, unknown>) => void;
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
  const snapshotListeners = new Set<(snapshot: LocalThreadSnapshot) => void>();

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
        return existing.runtime;
      }
      const seed = existing
        ? {
            ...initial,
            ...existing.runtime.getSnapshot(),
          }
        : initial;
      if (existing) void existing.runtime.dispose();

      const agent = createAgent(config);
      let runs = readPromptRuns(seed.state).map(run => endPromptRun(run, 'interrupted', Date.now(), '运行中断，请重试'));
      const clientKeys = ['h3Composer', 'h3Versions', 'h3SelectedVersionId', 'h3ReadAt'];
      const clientState: Record<string, unknown> = {};
      for (const key of clientKeys) if (key in (seed.state ?? {})) clientState[key] = (seed.state as Record<string, unknown>)[key];
      const mergeState = (state: unknown) => ({ ...(state as Record<string, unknown>), ...clientState, ...(runs.length ? { h3Runs: runs } : {}) });
      let snapshot = { ...seed, state: mergeState(seed.state) } as LocalThreadSnapshot;
      agent.threadId = seed.threadId;
      agent.setMessages(seed.messages);
      agent.setState(snapshot.state);
      let pendingSave: LocalThreadSnapshot | undefined;
      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      let maxTimer: ReturnType<typeof setTimeout> | undefined;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let active = true;
      let disposePromise: Promise<void> | undefined;
      const listeners = new Set<(event: RuntimeEvent) => void>();
      const emit = (event: RuntimeEvent) => {
        if (!active) return;
        if (event.type === 'snapshot') for (const listener of snapshotListeners) listener(event.snapshot);
        for (const listener of listeners) listener(event);
      };
      const clearSaveTimers = () => {
        if (saveTimer) clearTimeout(saveTimer);
        if (maxTimer) clearTimeout(maxTimer);
        if (retryTimer) clearTimeout(retryTimer);
        saveTimer = maxTimer = retryTimer = undefined;
      };
      const schedule = () => {
        if (!active || retryTimer) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { void flush(); }, 300);
        if (!maxTimer) maxTimer = setTimeout(() => { void flush(); }, 2000);
      };
      const persist = (messages: readonly unknown[], state: unknown, boundary = false) => {
        if (!active) return;
        snapshot = { ...snapshot, messages: [...messages] as never, state: mergeState(state) as never, updatedAt: Date.now() };
        emit({ type: 'snapshot', snapshot });
        pendingSave = snapshot;
        if (boundary) void flush(); else schedule();
      };
      const flush = async (): Promise<void> => {
        clearSaveTimers();
        const next = pendingSave;
        pendingSave = undefined;
        if (!next) { await saveTails.get(initial.threadId); return; }
        try {
          await enqueueSave(initial.threadId, () => threadStore.save(next));
        } catch (reason) {
          // A newer update supersedes this failed write. Never erase either one.
          pendingSave ??= snapshot;
          clearSaveTimers();
          emit({ type: 'error', message: reason instanceof Error ? `本地会话保存失败：${reason.message}` : '本地会话保存失败' });
          if (active && !retryTimer) retryTimer = setTimeout(() => { retryTimer = undefined; void flush(); }, 2000);
          return;
        }
        if (active && pendingSave) schedule();
      };
      const transition = (runId: string, state: unknown, messages: readonly unknown[], status: 'failed' | 'cancelled', error?: string) => {
        runs = runs.map(run => run.id === runId ? endPromptRun(run, status, Date.now(), error) : run);
        persist(messages, state, true);
        return { state: mergeState(state) as never };
      };
      const subscription = agent.subscribe({
        onMessagesChanged: ({ messages, state }) => {
          const prior = new Set(snapshot.messages.map(message => message.id));
          const boundary = messages.some(message => !prior.has(message.id) && (message.role === 'user' || message.role === 'tool' || 'toolCallId' in message));
          persist(messages, state, boundary);
        },
        onStateChanged: ({ messages, state }) => persist(messages, state),
        onStateSnapshotEvent: ({ event }) => ({ state: mergeState((event as any).snapshot) as never, stopPropagation: true }),
        onRunInitialized: ({ input, state, messages }) => {
          const retry = agent.getPreparedRetry?.();
          const user = [...messages].reverse().find(message => message.role === 'user');
          if (!runs.some(run => run.id === input.runId)) runs = [...runs, {
            id: input.runId, userMessageId: retry?.userMessageId ?? user?.id ?? '', status: 'running', startedAt: Date.now(),
            ...(retry?.retryOf ? { retryOf: retry.retryOf } : {}), messageIds: [], tools: [],
          }];
          persist(messages, state, true);
          return { state: mergeState(state) as never };
        },
        onEvent: ({ input, event, state, messages }) => {
          const updated = runs.map(run => run.id === input.runId ? reducePromptRunEvent(run, event, Date.now()) : run);
          if (updated.some((run, index) => run !== runs[index])) {
            runs = updated;
            persist(messages, state, ['RUN_ERROR', 'RUN_FINISHED', 'CUSTOM'].includes(event.type));
          }
          return { state: mergeState(state) as never };
        },
        onRunFailed: ({ input, state, messages, error }) => transition(input.runId, state, messages, 'failed', error.message),
        onRunFinalized: ({ input, state, messages }) => transition(input.runId, state, messages, 'cancelled'),
      });
      const dispose = (): Promise<void> => {
        if (disposePromise) return disposePromise;
        runs = runs.map(run => endPromptRun(run, 'cancelled', Date.now()));
        if (runs.length) persist(snapshot.messages, snapshot.state);
        active = false;
        clearSaveTimers();
        subscription?.unsubscribe?.();
        agent.dispose?.();
        disposePromise = flush().then(() => { listeners.clear(); });
        return disposePromise;
      };
      if (readPromptRuns(seed.state).some(run => run.status === 'running')) persist(snapshot.messages, snapshot.state, true);

      const runtime: PromptRuntime = {
        agent,
        getSnapshot: () => snapshot,
        updateMetadata: (next) => {
          if (!active) return;
          snapshot = {
            ...snapshot,
            customTitle: next.customTitle,
            updatedAt: Math.max(snapshot.updatedAt, next.updatedAt),
          };
          if (pendingSave) pendingSave = snapshot;
          emit({ type: 'snapshot', snapshot });
        },
        patchClientState: (patch) => {
          if (!active) return;
          for (const key of clientKeys) if (key in patch) clientState[key] = patch[key];
          const state = mergeState({ ...snapshot.state, ...patch });
          agent.setState(state as never);
          persist(snapshot.messages, state);
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
    subscribe(listener: (snapshot: LocalThreadSnapshot) => void): () => void {
      snapshotListeners.add(listener);
      return () => { snapshotListeners.delete(listener); };
    },
    async renameThread(threadId: string, title: string, threadStore: LocalThreadStore) {
      const metadata = { customTitle: title, updatedAt: Date.now() };
      const runtime = runtimes.get(threadId)?.runtime;
      // Refresh pending and future stream saves before queuing the metadata write.
      // An already in-flight transcript save completes before this UPDATE.
      runtime?.updateMetadata(metadata);
      const flushing = runtime?.flush();
      const renaming = enqueueSave(threadId, () => threadStore.rename(threadId, title, metadata.updatedAt));
      await Promise.all([flushing, renaming]);
      return metadata;
    },
    async evictThread(threadId: string): Promise<void> {
      const entry = runtimes.get(threadId);
      if (!entry) return;
      runtimes.delete(threadId);
      await entry.runtime.dispose();
    },
    async flushAll(): Promise<void> {
      await Promise.all([...runtimes.values()].map(entry => entry.runtime.flush()));
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
