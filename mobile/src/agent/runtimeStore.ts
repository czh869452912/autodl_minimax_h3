import { endPromptRun, readPromptRuns, reducePromptRunEvent } from './runState';
import type { H3AgUiAgent } from './aguiAgent';
import { H3_GRAPH_VERSION, type H3AgentConfig } from './agentTypes';
import type { LocalThreadSnapshot, LocalThreadStore } from './threadStore';
import type { SubmissionCommand, SubmissionReceipt } from './submissionCommands';
import { readPromptVersions, reconcilePromptVersions } from './promptVersions';
export type FlushResult = { kind: 'saved' } | { kind: 'failed'; error: Error };

export type PromptAgentConfig = H3AgentConfig;

export type RuntimeEvent =
  | { type: 'snapshot'; snapshot: LocalThreadSnapshot }
  | { type: 'error'; message: string };

export type PromptRuntime = {
  agent: H3AgUiAgent;
  getSnapshot: () => LocalThreadSnapshot;
  getViewSnapshot: () => LocalThreadSnapshot & { transcriptRevision: number };
  subscribeView: (listener: () => void) => () => void;
  updateMetadata: (metadata: Pick<LocalThreadSnapshot, 'customTitle' | 'updatedAt'>) => void;
  patchClientState: (patch: Record<string, unknown>) => void;
  flush: () => Promise<FlushResult>;
  accept: (command: SubmissionCommand) => Promise<SubmissionReceipt>;
  dispose: () => Promise<void>;
  disposed: () => boolean;
  idle: () => boolean;
  needsReload: () => boolean;
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
  const workspace = require('./agentWorkspace') as typeof import('./agentWorkspace');
  return new H3AgUiAgent(createH3Agent(config) as never, {}, { workspace, budget: workspace.getH3ContextBudget(config), deadlineMs: Math.max(60000, config.timeoutMs * 2) });
}

function configKey(config: PromptAgentConfig): string {
  return `${H3_GRAPH_VERSION}\u0000${config.endpoint}\u0000${config.model}\u0000${config.apiKey}\u0000${config.timeoutMs}\u0000${config.maxRetries}\u0000${config.contextWindowTokens}\u0000${config.maxOutputTokens}`;
}

function mergeRecoveryComposer(durable: LocalThreadSnapshot, local: LocalThreadSnapshot): LocalThreadSnapshot {
  const composer = (local.state as Record<string, any>).h3Composer;
  const savedComposer = (durable.state as Record<string, any>).h3Composer;
  if (!composer || !Number.isFinite(composer.revision) || composer.revision < (Number(savedComposer?.revision) || 0)) return durable;
  return { ...durable, state: { ...durable.state, h3Composer: composer }, updatedAt: Math.max(durable.updatedAt, local.updatedAt) };
}

export function createPromptRuntimeRegistry(
  createAgent: AgentFactory = defaultAgentFactory,
) {
  const runtimes = new Map<string, { configKey: string; runtime: PromptRuntime }>();
  const saveTails = new Map<string, Promise<void>>();
  const failedSaves = new Set<string>();
  const snapshotListeners = new Set<(snapshot: LocalThreadSnapshot) => void>();
  const summaryListeners = new Set<(snapshot: LocalThreadSnapshot) => void>();

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
      if (existing?.configKey === key && !existing.runtime.needsReload() && !existing.runtime.disposed()) {
        runtimes.delete(initial.threadId); runtimes.set(initial.threadId, existing);
        return existing.runtime;
      }
      const seed = existing && !existing.runtime.needsReload()
        ? {
            ...initial,
            ...existing.runtime.getSnapshot(),
          }
        : existing ? mergeRecoveryComposer(initial, existing.runtime.getSnapshot()) : initial;
      if (existing) void existing.runtime.dispose().catch(() => undefined);

      const agent = createAgent(config);
      let runs = readPromptRuns(seed.state).map(run => endPromptRun(run, 'interrupted', Date.now(), '运行中断，请重试'));
      const clientKeys = ['h3Composer', 'h3Versions', 'h3SelectedVersionId', 'h3ReadAt', 'h3Workspace', 'h3Workspaces'];
      const clientState: Record<string, unknown> = {};
      for (const key of clientKeys) if (key in (seed.state ?? {})) clientState[key] = (seed.state as Record<string, unknown>)[key];
      const mergeState = (state: unknown) => ({ ...(state as Record<string, unknown>), ...clientState, ...(runs.length ? { h3Runs: runs } : {}) });
      let reasoningBuffer: { runId: string; messageId: string; chunks: string[]; at: number } | undefined;
      let reasoningTimer: ReturnType<typeof setTimeout> | undefined;
      const flushReasoning = () => {
        if (reasoningTimer) clearTimeout(reasoningTimer);
        reasoningTimer = undefined;
        const pending = reasoningBuffer;
        reasoningBuffer = undefined;
        if (!pending) return false;
        runs = runs.map(run => run.id === pending.runId ? reducePromptRunEvent(run, { type: 'CUSTOM', name: 'h3.reasoning', value: { messageId: pending.messageId, delta: pending.chunks.join('') } }, pending.at) : run);
        return true;
      };
      let snapshot = { ...seed, state: mergeState(seed.state) } as LocalThreadSnapshot;
      let transcriptRevision = 0;
      let viewSnapshot = { ...snapshot, transcriptRevision };
      let viewTimer: ReturnType<typeof setTimeout> | undefined;
      const viewListeners = new Set<() => void>();
      const publishView = () => { if (viewTimer) clearTimeout(viewTimer); viewTimer = undefined; viewSnapshot = { ...snapshot, transcriptRevision }; for (const listener of viewListeners) listener(); };
      let versionCompletionKey = '';
      agent.threadId = seed.threadId;
      agent.setMessages(seed.messages);
      agent.setState(snapshot.state);
      let pendingSave: LocalThreadSnapshot | undefined;
      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      let maxTimer: ReturnType<typeof setTimeout> | undefined;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let active = true;
      let disposePromise: Promise<void> | undefined;
      let accepting = false;
      let needsReload = false;
      const listeners = new Set<(event: RuntimeEvent) => void>();
      let summarySignature = '';
      let lastError: string | undefined;
      const emit = (event: RuntimeEvent) => {
        if (!active) return;
        if (event.type === 'error') lastError = event.message;
        if (event.type === 'snapshot') for (const listener of snapshotListeners) listener(event.snapshot);
        if (event.type === 'snapshot') {
          const next = event.snapshot;
          const lastRun = readPromptRuns(next.state).at(-1);
          const signature = [next.customTitle, next.messages.length, lastRun?.id, lastRun?.status, (next.state as any).h3ReadAt].join('|');
          if (signature !== summarySignature) { summarySignature = signature; for (const listener of summaryListeners) listener(next); }
        }
        for (const listener of listeners) listener(event);
      };
      const clearSaveTimers = () => {
        if (saveTimer) clearTimeout(saveTimer);
        if (maxTimer) clearTimeout(maxTimer);
        if (retryTimer) clearTimeout(retryTimer);
        saveTimer = maxTimer = retryTimer = undefined;
      };
      const reportSaveFailure = (message: string) => {
        failedSaves.add(initial.threadId);
        emit({ type: 'error', message: failedSaves.size > 5 ? `${message}。${failedSaves.size} 个会话尚未保存，草稿仍保留在内存中，请恢复存储后重试。` : message });
      };
      const schedule = () => {
        if (!active || accepting || needsReload || retryTimer) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { void flush(); }, 300);
        if (!maxTimer) maxTimer = setTimeout(() => { void flush(); }, 2000);
      };
      const persist = (messages: readonly unknown[], state: unknown, boundary = false) => {
        if (!active) return;
        snapshot = { ...snapshot, messages: [...messages] as never, state: mergeState(state) as never, updatedAt: Date.now() };
        if (needsReload) { publishView(); return; }
        const completed = (snapshot.state as any).h3CompletedMessageIds;
        const completedKey = Array.isArray(completed) ? completed.join('\0') : '';
        if (completedKey && completedKey !== versionCompletionKey) {
          const previous = readPromptVersions(snapshot.state);
          const versions = reconcilePromptVersions(snapshot.messages, completed, previous, Date.now(), runs);
          if (versions.length !== previous.length) { clientState.h3Versions = versions; snapshot = { ...snapshot, state: mergeState(snapshot.state) }; }
          versionCompletionKey = completedKey;
        }
        emit({ type: 'snapshot', snapshot });
        if (boundary || !agent.isRunning) publishView();
        else if (!viewTimer) viewTimer = setTimeout(publishView, 50);
        pendingSave = snapshot;
        if (boundary) void flush(); else schedule();
      };
      const flush = async (): Promise<FlushResult> => {
        if (flushReasoning()) { snapshot = { ...snapshot, state: mergeState(snapshot.state) }; pendingSave = snapshot; }
        clearSaveTimers();
        if (needsReload) {
          pendingSave = undefined;
          try {
            await enqueueSave(initial.threadId, async () => {
              let composer: unknown;
              do {
                const durable = await threadStore.load(initial.threadId);
                if (!durable) throw new Error('已接受的会话无法恢复');
                composer = (snapshot.state as Record<string, unknown>).h3Composer;
                // Only a fresh durable read may supply transcript and run records after acceptance.
                await threadStore.save(mergeRecoveryComposer(durable, snapshot));
              } while (composer !== (snapshot.state as Record<string, unknown>).h3Composer);
            });
            failedSaves.delete(initial.threadId);
            lastError = undefined;
            return { kind: 'saved' };
          } catch (reason) {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            reportSaveFailure(`本地会话恢复失败，草稿已保留：${error.message}`);
            return { kind: 'failed', error };
          }
        }
        const next = pendingSave;
        pendingSave = undefined;
        if (!next) { await saveTails.get(initial.threadId); return pendingSave ? flush() : { kind: 'saved' }; }
        try {
          await enqueueSave(initial.threadId, () => threadStore.save(next));
        } catch (reason) {
          // A newer update supersedes this failed write. Never erase either one.
          pendingSave ??= snapshot;
          clearSaveTimers();
          reportSaveFailure(reason instanceof Error ? `本地会话保存失败：${reason.message}` : '本地会话保存失败');
          if (active && !retryTimer) retryTimer = setTimeout(() => { retryTimer = undefined; void flush(); }, 2000);
          return { kind: 'failed', error: reason instanceof Error ? reason : new Error(String(reason)) };
        }
        if (active && pendingSave) schedule();
        failedSaves.delete(initial.threadId);
        lastError = undefined;
        return { kind: 'saved' };
      };
      const transition = (runId: string, state: unknown, messages: readonly unknown[], status: 'failed' | 'cancelled', error?: string) => {
        flushReasoning();
        runs = runs.map(run => run.id === runId ? endPromptRun(run, status, Date.now(), error) : run);
        persist(messages, state, true);
        return { state: mergeState(state) as never };
      };
      const subscription = agent.subscribe({
        onMessagesChanged: ({ messages, state }) => {
          transcriptRevision++;
          const prior = new Set(snapshot.messages.map(message => message.id));
          const boundary = messages.some(message => !prior.has(message.id) && (message.role === 'user' || message.role === 'tool' || 'toolCallId' in message));
          persist(messages, state, boundary);
        },
        onStateChanged: ({ messages, state }) => persist(messages, state),
        onStateSnapshotEvent: ({ event }) => ({ state: mergeState((event as any).snapshot) as never, stopPropagation: true }),
        onRunInitialized: ({ input, state, messages }) => {
          const retry = agent.getPreparedRetry?.();
          const user = [...messages].reverse().find(message => message.role === 'user');
          const baseWorkspaceRevision = Number(retry ? (retry.workspace as any)?.revision ?? 0 : (state as any)?.h3Workspace?.revision) || 0;
          if (!runs.some(run => run.id === input.runId)) runs = [...runs, {
            id: input.runId, userMessageId: retry?.userMessageId ?? user?.id ?? '', status: 'running', startedAt: Date.now(),
            ...(retry?.retryOf ? { retryOf: retry.retryOf } : {}), baseWorkspaceRevision, messageIds: [], tools: [],
          }];
          else runs = runs.map(run => run.id === input.runId && run.status === 'queued' ? { ...run, baseWorkspaceRevision } : run);
          persist(messages, state, true);
          return { state: mergeState(state) as never };
        },
        onEvent: ({ input, event, state, messages }) => {
          if (event.type === 'CUSTOM' && (event as any).name === 'h3.reasoning') {
            const value = (event as any).value;
            if (typeof value?.messageId !== 'string' || typeof value.delta !== 'string') return;
            if (reasoningBuffer && (reasoningBuffer.runId !== input.runId || reasoningBuffer.messageId !== value.messageId)) flushReasoning();
            reasoningBuffer ??= { runId: input.runId, messageId: value.messageId, chunks: [], at: Date.now() };
            reasoningBuffer.chunks.push(value.delta);
            if (!reasoningTimer) reasoningTimer = setTimeout(() => {
              if (flushReasoning()) { persist(snapshot.messages, snapshot.state); agent.setState(mergeState(snapshot.state) as never); }
            }, 50);
            return;
          }
          const hadReasoning = flushReasoning();
          if (event.type === 'CUSTOM' && (event as any).name === 'h3.workspace' && runs.some(run => run.id === input.runId && run.status === 'running')) {
            const workspace = (event as any).value.workspace;
            clientState.h3Workspace = workspace;
            clientState.h3Workspaces = [...((clientState.h3Workspaces as any[]) ?? []).filter(value => value.revision !== workspace.revision), { ...workspace, id: String(workspace.revision) }];
            persist(messages, state, true);
          }
          const updated = runs.map(run => run.id === input.runId ? reducePromptRunEvent(run, event, Date.now()) : run);
          if (hadReasoning || updated.some((run, index) => run !== runs[index])) {
            runs = updated;
            persist(messages, state, ['RUN_ERROR', 'RUN_FINISHED', 'CUSTOM'].includes(event.type) && (event as any).name !== 'h3.reasoning');
            return { state: mergeState(state) as never };
          }
        },
        onRunFailed: ({ input, state, messages, error }) => transition(input.runId, state, messages, 'failed', error.message),
        onRunFinalized: ({ input, state, messages }) => transition(input.runId, state, messages, 'cancelled'),
      });
      const dispose = (): Promise<void> => {
        if (disposePromise) return disposePromise;
        flushReasoning();
        if (!needsReload) {
          runs = runs.map(run => endPromptRun(run, 'cancelled', Date.now()));
          if (runs.length) persist(snapshot.messages, snapshot.state);
        }
        active = false;
        if (viewTimer) clearTimeout(viewTimer);
        clearSaveTimers();
        subscription?.unsubscribe?.();
        agent.dispose?.();
        disposePromise = flush().then(result => {
          if (result.kind === 'failed') { disposePromise = undefined; throw result.error; }
          listeners.clear();
          viewListeners.clear();
        });
        return disposePromise;
      };
      if (existing || readPromptRuns(seed.state).some(run => run.status === 'running' || run.status === 'queued')) persist(snapshot.messages, snapshot.state, true);

      const runtime: PromptRuntime = {
        agent,
        accept: async command => {
          if (!active || accepting || needsReload || agent.isRunning) throw new Error('当前会话无法提交，请等待运行结束或重新打开会话');
          accepting = true;
          try {
            const flushed = await flush();
            if (flushed.kind === 'failed') throw flushed.error;
            if (!active) throw new Error('会话已关闭，草稿已保留');
            await enqueueSave(initial.threadId, async () => { await threadStore.accept(snapshot, command); });
            const receipt = { submissionId: command.id, userMessageId: command.message.id, runId: command.runId };
            if (!active) return receipt;
            let saved: LocalThreadSnapshot | null;
            try {
              saved = await threadStore.load(initial.threadId);
              if (!saved) throw new Error('无法回读会话');
            } catch {
              agent.clearPreparedRetry?.();
              needsReload = true;
              pendingSave = undefined;
              clearSaveTimers();
              emit({ type: 'error', message: '消息已保存，但运行尚未启动。请重新打开会话后重试该运行。' });
              return { ...receipt, executionReady: false };
            }
            if (!active) return receipt;
            const currentComposer = clientState.h3Composer as any;
            const acceptedState = saved.state as Record<string, any>;
            for (const key of clientKeys) if (key in acceptedState) clientState[key] = acceptedState[key];
            if (currentComposer?.revision > command.draftRevision) clientState.h3Composer = currentComposer;
            runs = readPromptRuns(saved.state);
            snapshot = { ...saved, state: mergeState(saved.state) };
            transcriptRevision++;
            agent.setMessages(saved.messages);
            agent.setState(snapshot.state);
            persist(snapshot.messages, snapshot.state);
            return receipt;
          } catch (error) { agent.clearPreparedRetry?.(); throw error; }
          finally { accepting = false; }
        },
        getSnapshot: () => snapshot,
        getViewSnapshot: () => viewSnapshot,
        subscribeView: listener => { viewListeners.add(listener); return () => { viewListeners.delete(listener); }; },
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
          publishView();
        },
        flush,
        dispose,
        disposed: () => !active,
        idle: () => active && !needsReload && !agent.isRunning && !accepting && !pendingSave && listeners.size === 0 && viewListeners.size === 0,
        needsReload: () => needsReload,
        subscribe: (listener) => {
          listeners.add(listener);
          if (lastError) listener({ type: 'error', message: lastError });
          return () => listeners.delete(listener);
        },
      };
      runtimes.set(initial.threadId, { configKey: key, runtime });
      void Promise.resolve().then(async () => {
        const idle = [...runtimes.entries()].filter(([id, entry]) => id !== initial.threadId && entry.runtime.idle());
        for (const [id, entry] of idle.slice(0, Math.max(0, idle.length - 4))) {
          try { await entry.runtime.dispose(); if (runtimes.get(id) === entry) { runtimes.delete(id); saveTails.delete(id); } } catch { /* Dirty runtimes stay owned for retry. */ }
        }
      });
      return runtime;
    },
    subscribe(listener: (snapshot: LocalThreadSnapshot) => void): () => void {
      snapshotListeners.add(listener);
      return () => { snapshotListeners.delete(listener); };
    },
    subscribeSummary(listener: (snapshot: LocalThreadSnapshot) => void): () => void {
      summaryListeners.add(listener); return () => { summaryListeners.delete(listener); };
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
      await entry.runtime.dispose();
      if (runtimes.get(threadId) === entry) runtimes.delete(threadId);
    },
    async flushAll(): Promise<void> {
      await Promise.all([...runtimes.values()].map(entry => entry.runtime.flush()));
    },
    async disposeAll(): Promise<void> {
      const entries = [...runtimes.values()];
      await Promise.all(entries.map(async entry => {
        await entry.runtime.dispose();
        const id = entry.runtime.getSnapshot().threadId;
        if (runtimes.get(id) === entry) runtimes.delete(id);
      }));
    },
    size(): number { return runtimes.size; },
    liveThreadIds(): string[] { return [...runtimes].filter(([, entry]) => entry.runtime.agent.isRunning).map(([id]) => id); },
  };
}

export const promptRuntimeRegistry = createPromptRuntimeRegistry();
