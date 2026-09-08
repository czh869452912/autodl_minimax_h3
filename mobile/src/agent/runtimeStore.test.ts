import { createPromptRuntimeRegistry } from './runtimeStore';
import type { LocalThreadSnapshot, LocalThreadStore } from './threadStore';
import { createLocalThreadStore } from './threadStore';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { createTimelineProjection } from './timelineProjection';
import { normalizeMessages } from './agentPresentation';

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

it('recreates an idle runtime when the reasoning effort changes', async () => {
  const factory = jest.fn(() => fakeAgent() as never);
  const registry = createPromptRuntimeRegistry(factory);
  try {
    const first = registry.ensure({ ...config, reasoningEffort: 'low' }, snapshot('effort'), store);
    await first.flush();
    const next = registry.ensure({ ...config, reasoningEffort: 'high' }, snapshot('effort'), store);
    expect(next).not.toBe(first);
    expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ reasoningEffort: 'high' }));
  } finally { await registry.disposeAll(); }
});

it('batches reasoning bursts and flushes the tail before terminal persistence', async () => {
  jest.useFakeTimers();
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('reasoning-batch'), store);
  const agent = runtime.agent as any;
  agent.isRunning = true;
  agent.emit('onRunInitialized', { input: { runId: 'r' } });
  const views = jest.fn(); runtime.subscribeView(views);
  try {
    for (let n = 0; n < 1000; n++) agent.emit('onEvent', { input: { runId: 'r' }, event: { type: 'CUSTOM', name: 'h3.reasoning', value: { messageId: 'a', delta: 'x' } } });
    expect(views).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    expect(views).toHaveBeenCalledTimes(1);
    expect((runtime.getSnapshot().state as any).h3Runs[0].activities[0].text).toBe('x'.repeat(1000));
    agent.emit('onEvent', { input: { runId: 'r' }, event: { type: 'CUSTOM', name: 'h3.reasoning', value: { messageId: 'a', delta: 'tail' } } });
    agent.emit('onEvent', { input: { runId: 'r' }, event: { type: 'RUN_FINISHED' } });
    await runtime.flush();
    expect((runtime.getSnapshot().state as any).h3Runs[0]).toMatchObject({ status: 'completed', activities: [{ text: 'x'.repeat(1000) + 'tail' }] });
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});

it('publishes buffered reasoning on explicit flush without another stream event', async () => {
  jest.useFakeTimers();
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('reasoning-flush'), store);
  const agent = runtime.agent as any;
  agent.isRunning = true;
  agent.emit('onRunInitialized', { input: { runId: 'r' } });
  const views = jest.fn(); runtime.subscribeView(views);
  try {
    agent.emit('onEvent', { input: { runId: 'r' }, event: { type: 'CUSTOM', name: 'h3.reasoning', value: { messageId: 'a', delta: 'tail' } } });
    await runtime.flush();
    expect(views).toHaveBeenCalledTimes(1);
    expect((runtime.getViewSnapshot().state as any).h3Runs[0].activities[0].text).toBe('tail');
    await jest.advanceTimersByTimeAsync(100);
    expect(views).toHaveBeenCalledTimes(1);
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});

it('isolates 1999 completed rows across 1000 deltas in ten seconds and composer edits from summaries', async () => {
  jest.useFakeTimers();
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const messages = Array.from({ length: 2000 }, (_, index) => ({ id: `m-${index}`, role: 'assistant' as const, content: 'saved' }));
  const runtime = registry.ensure(config, { ...snapshot('scale'), messages }, store);
  const agent = runtime.agent as any;
  const normalize = jest.fn(normalizeMessages), project = createTimelineProjection(normalize);
  project(messages); normalize.mockClear();
  const views = jest.fn(() => project(runtime.getViewSnapshot().messages));
  runtime.subscribeView(views);
  const summaries = jest.fn(); registry.subscribeSummary(summaries);
  agent.isRunning = true;
  try {
    for (let index = 0; index < 1000; index++) {
      messages[1999] = { ...messages[1999], content: `delta-${index}` };
      agent.emitMessages(messages, {});
      await jest.advanceTimersByTimeAsync(10);
    }
    expect(views).toHaveBeenCalledTimes(200);
    expect(normalize).toHaveBeenCalledTimes(200);
    expect(normalize.mock.calls.every(([rows]) => (rows[0] as any).id === 'm-1999')).toBe(true);
    expect(runtime.getViewSnapshot().messages.at(-1)?.content).toBe('delta-999');
    summaries.mockClear(); normalize.mockClear();
    for (let index = 0; index < 100; index++) runtime.patchClientState({ h3Composer: { text: `draft-${index}`, revision: index } });
    expect(summaries).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});

it('reports retained cache pressure after repeated save failures and keeps every draft owned', async () => {
  let fail = true;
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const persistence = { save: async () => { if (fail) throw new Error('disk full'); } } as unknown as LocalThreadStore;
  try {
    for (let index = 0; index < 6; index++) {
      const runtime = registry.ensure(config, snapshot(`dirty-${index}`), persistence);
      runtime.patchClientState({ h3Composer: { text: `draft-${index}`, revision: 1 } });
      await runtime.flush();
    }
    const notices: string[] = [];
    const last = registry.ensure(config, snapshot('dirty-5'), persistence);
    const unsubscribe = last.subscribe(event => { if (event.type === 'error') notices.push(event.message); });
    expect(notices.some(message => message.includes('6 个会话') && message.includes('保留'))).toBe(true);
    expect(registry.size()).toBe(6);
    for (let index = 0; index < 6; index++) expect(registry.ensure(config, snapshot(`dirty-${index}`), persistence).getSnapshot().state).toMatchObject({ h3Composer: { text: `draft-${index}` } });
    unsubscribe();
  } finally { fail = false; await registry.disposeAll(); }
});

it('reopens an accepted run from SQLite after its first readback fails', async () => {
  const db = createInitializedRealSqliteTestDb();
  const persistence = createLocalThreadStore(db as never);
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  try {
    const initial = { ...snapshot('accepted-reopen'), messages: [], state: { h3Composer: { text: 'durable prompt', revision: 1 } } };
    await persistence.save(initial);
    const runtime = registry.ensure(config, initial, persistence);
    jest.spyOn(persistence, 'load').mockRejectedValueOnce(new Error('readback busy'));
    const command = { id: 'submission', runId: 'accepted-run', draftRevision: 1, message: { id: 'accepted-user', role: 'user' as const, content: 'durable prompt' } };
    expect(await runtime.accept(command)).toMatchObject({ executionReady: false, submissionId: command.id });
    expect(runtime.needsReload()).toBe(true);
    const saved = await persistence.load(initial.threadId);
    const reopened = registry.ensure(config, saved!, persistence);
    expect(reopened).not.toBe(runtime);
    expect(reopened.getSnapshot().messages).toEqual([command.message]);
    expect((reopened.getSnapshot().state as any).h3Runs).toEqual([expect.objectContaining({ id: command.runId, userMessageId: command.message.id, status: 'interrupted' })]);
    await reopened.flush();
    expect(db.getAllSync('SELECT * FROM agent_submissions')).toHaveLength(1);
    expect((await persistence.load(initial.threadId))?.messages).toEqual([command.message]);
  } finally { await registry.disposeAll(); db.close(); }
});

it('clears prepared retry after transactional acceptance fails and preserves the failed run', async () => {
  const db = createInitializedRealSqliteTestDb();
  const persistence = createLocalThreadStore(db as never);
  const agent = { ...fakeAgent(), clearPreparedRetry: jest.fn() };
  const registry = createPromptRuntimeRegistry(() => agent as never);
  try {
    const initial = { ...snapshot('rejected-retry'), state: { h3Composer: { text: 'new draft', revision: 2 }, h3Runs: [{ id: 'failed-run', userMessageId: 'rejected-retry-message', status: 'failed', startedAt: 1, endedAt: 2, messageIds: [], tools: [] }] } };
    await persistence.save(initial);
    const runtime = registry.ensure(config, initial, persistence);
    const write = db.runAsync.bind(db);
    jest.spyOn(db, 'runAsync').mockImplementation(async (sql, ...params) => {
      if (sql.startsWith('INSERT INTO agent_submissions')) throw new Error('disk full');
      return write(sql, ...params);
    });
    await expect(runtime.accept({ id: 'retry-submit', runId: 'retry-run', retryOf: 'failed-run', draftRevision: -1, message: initial.messages[0] })).rejects.toThrow('disk full');
    expect(agent.clearPreparedRetry).toHaveBeenCalledTimes(1);
    expect(db.getAllSync('SELECT * FROM agent_submissions')).toHaveLength(0);
    const saved = await persistence.load(initial.threadId);
    expect(saved?.state).toMatchObject(initial.state);
    expect((saved?.state as any).h3Runs).toHaveLength(1);
    expect(saved?.messages).toEqual(initial.messages);
  } finally { await registry.disposeAll(); db.close(); }
});

it.each([false, true])('preserves committed history and newer composer through failed readback, disposal and reopening (retry=%s)', async retry => {
  const db = createInitializedRealSqliteTestDb();
  const persistence = createLocalThreadStore(db as never);
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  try {
    const initial = { ...snapshot('recover-draft'), messages: [...snapshot('recover-draft').messages, { id: 'partial', role: 'assistant' as const, content: 'preserved partial reply' }], state: { h3Composer: { text: 'send me', attachments: [], revision: 1 }, h3Runs: [{ id: 'failed', userMessageId: 'recover-draft-message', status: 'failed', startedAt: 1, endedAt: 2, messageIds: ['partial'], tools: [] }] } };
    await persistence.save(initial);
    const runtime = registry.ensure(config, initial, persistence);
    let rejectRead!: (reason: Error) => void;
    let readStarted!: () => void;
    const reading = new Promise<void>(resolve => { readStarted = resolve; });
    jest.spyOn(persistence, 'load').mockImplementationOnce(async () => {
      readStarted();
      return new Promise((_resolve, reject) => { rejectRead = reject; });
    });
    const message = retry ? initial.messages[0] : { id: 'new-user', role: 'user' as const, content: 'send me' };
    const accepting = runtime.accept({ id: 'accepted', runId: 'queued', message, draftRevision: retry ? -1 : 1, ...(retry ? { retryOf: 'failed' } : {}) });
    await reading;
    runtime.patchClientState({ h3Composer: { text: 'typed during readback', attachments: [], revision: 2 } });
    rejectRead(new Error('readback failed'));
    expect(await accepting).toMatchObject({ executionReady: false });
    const committed = await persistence.load(initial.threadId);
    const saves = jest.spyOn(persistence, 'save');
    const newerComposer = { text: 'typed after readback failed', attachments: [], revision: 3 };
    runtime.patchClientState({ h3Composer: newerComposer });
    await runtime.dispose();
    const afterDisposal = await persistence.load(initial.threadId);
    const expectedMessages = retry ? initial.messages : [...initial.messages, message];
    expect(saves).toHaveBeenCalled();
    for (const [saved] of saves.mock.calls) {
      expect(saved.messages).toEqual(expectedMessages);
      expect((saved.state as any).h3Runs).toHaveLength(2);
    }
    expect(afterDisposal?.messages).toEqual(expectedMessages);
    expect((afterDisposal?.state as any).h3Runs).toEqual([
      expect.objectContaining({ id: 'failed', status: 'failed' }),
      expect.objectContaining({ id: 'queued', status: 'queued' }),
    ]);
    expect(afterDisposal?.state).toMatchObject({ h3Composer: newerComposer });
    const reopened = registry.ensure(config, committed!, persistence);
    expect(reopened.getSnapshot().messages).toEqual(expectedMessages);
    expect(reopened.getSnapshot().state).toMatchObject({ h3Composer: newerComposer });
    expect((reopened.getSnapshot().state as any).h3Runs.at(-1)).toMatchObject({ id: 'queued', status: 'interrupted' });
    await reopened.flush();
    expect((await persistence.load(initial.threadId))?.state).toMatchObject({ h3Composer: newerComposer });
    expect(db.getAllSync('SELECT * FROM agent_submissions')).toHaveLength(1);
  } finally { await registry.disposeAll(); db.close(); }
});

it('keeps recovery drafts owned when disposal cannot reload the committed transcript', async () => {
  const db = createInitializedRealSqliteTestDb();
  const persistence = createLocalThreadStore(db as never);
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  try {
    const initial = { ...snapshot('recovery-disk'), messages: [], state: { h3Composer: { text: 'sent', attachments: [], revision: 1 } } };
    await persistence.save(initial);
    const runtime = registry.ensure(config, initial, persistence);
    const load = jest.spyOn(persistence, 'load').mockRejectedValueOnce(new Error('read failed'));
    const command = { id: 's', runId: 'r', draftRevision: 1, message: { id: 'u', role: 'user' as const, content: 'sent' } };
    expect(await runtime.accept(command)).toMatchObject({ executionReady: false });
    const newerComposer = { text: 'unsaved recovery draft', attachments: [], revision: 2 };
    runtime.patchClientState({ h3Composer: newerComposer });
    await expect(runtime.accept({ ...command, id: 'duplicate', runId: 'duplicate' })).rejects.toThrow('重新打开');
    const saves = jest.spyOn(persistence, 'save');
    load.mockRejectedValueOnce(new Error('still unavailable'));
    await expect(registry.evictThread(initial.threadId)).rejects.toThrow('still unavailable');
    expect(registry.size()).toBe(1);
    expect(saves).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().state).toMatchObject({ h3Composer: newerComposer });
    await registry.evictThread(initial.threadId);
    const saved = await persistence.load(initial.threadId);
    expect(saved?.messages).toEqual([command.message]);
    expect(saved?.state).toMatchObject({ h3Composer: newerComposer, h3Runs: [expect.objectContaining({ id: 'r', status: 'queued' })] });
    expect(db.getAllSync('SELECT * FROM agent_submissions')).toHaveLength(1);
  } finally { await registry.disposeAll(); db.close(); }
});

it('coalesces view deltas at 50ms and publishes a terminal boundary immediately', async () => {
  jest.useFakeTimers();
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('view'), store);
  const agent = runtime.agent as any;
  agent.isRunning = true;
  const seen = jest.fn();
  runtime.subscribeView(seen);
  try {
    for (let i = 0; i < 10; i++) agent.emitMessages([{ id: 'a', role: 'assistant', content: String(i) }], {});
    expect(seen).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(50);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(runtime.getViewSnapshot().messages[0].content).toBe('9');
    const input = { runId: 'run' };
    agent.emit('onRunInitialized', { input });
    seen.mockClear();
    agent.emit('onEvent', { input, event: { type: 'RUN_FINISHED' } });
    expect(seen).toHaveBeenCalledTimes(1);
  } finally { await registry.disposeAll(); jest.useRealTimers(); }
});

it('retains dirty data when disposal fails and releases it only after retry saves', async () => {
  let fail = true;
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  const runtime = registry.ensure(config, snapshot('dirty'), { save: async () => { if (fail) throw new Error('disk full'); } } as never);
  runtime.patchClientState({ h3Composer: { text: 'unsaved', revision: 1 } });
  await expect(registry.evictThread('dirty')).rejects.toThrow('disk full');
  expect(registry.size()).toBe(1);
  expect(runtime.getSnapshot().state).toMatchObject({ h3Composer: { text: 'unsaved' } });
  fail = false;
  await registry.evictThread('dirty');
  expect(registry.size()).toBe(0);
});

it('caps saved idle residents after browsing twenty conversations', async () => {
  const registry = createPromptRuntimeRegistry(() => fakeAgent() as never);
  for (let i = 0; i < 20; i++) { registry.ensure(config, snapshot(`idle-${i}`), store); await Promise.resolve(); await Promise.resolve(); }
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(registry.size()).toBeLessThanOrEqual(5);
  await registry.disposeAll();
});

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
  expect(await runtime.flush()).toMatchObject({ kind: 'failed' });
  fail = false;
  expect(await runtime.flush()).toMatchObject({ kind: 'saved' });
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
