jest.mock(require.resolve('uuid', { paths: [require.resolve('@ag-ui/client')] }), () => ({ v4: () => 'test-generated-id' }));
import { H3AgUiAgent } from './aguiAgent';
import { createPromptRuntimeRegistry } from './runtimeStore';
import { readPromptRuns } from './runState';
import type { LocalThreadStore, LocalThreadSnapshot } from './threadStore';

it('persists real AGUI lifecycle mutations and concurrent client patches through a retry', async () => {
  const inputs: any[] = [];
  let runtime: ReturnType<ReturnType<typeof createPromptRuntimeRegistry>['ensure']>;
  let attempt = 0;
  const graph = { stream: async function* (input: any) {
    inputs.push(input);
    attempt++;
    runtime.patchClientState({ h3Composer: { text: 'typed while streaming' }, h3Versions: [{ id: 'local-v' }] });
    yield [{ id: `answer-${attempt}`, type: 'ai', content: 'answer' }, {}];
    if (attempt === 1) throw new Error('offline');
  } };
  const registry = createPromptRuntimeRegistry(() => new H3AgUiAgent(graph));
  const saved: LocalThreadSnapshot[] = [];
  runtime = registry.ensure({ apiKey: 'key', endpoint: 'https://invalid.test', model: 'h3', timeoutMs: 1000, maxRetries: 0 }, {
    threadId: 't1', messages: [{ id: 'u1', role: 'user', content: 'original' }], state: {}, createdAt: 1, updatedAt: 1,
  }, { save: async snapshot => { saved.push(snapshot); } } as LocalThreadStore);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await runtime.agent.runAgent({ runId: 'first' }).catch(() => undefined);
    expect(readPromptRuns(runtime.getSnapshot().state)).toMatchObject([{ id: 'first', status: 'failed', messageIds: ['answer-1'] }]);
    runtime.agent.prepareRetry('first');
    await runtime.agent.runAgent({ runId: 'second' });
    await registry.flushAll();
    expect(inputs[1].messages).toEqual([{ id: 'u1', role: 'user', content: 'original' }]);
    expect(saved.at(-1)?.messages.map(message => message.id)).toEqual(['u1', 'answer-1', 'answer-2']);
    expect(readPromptRuns(saved.at(-1)?.state)).toMatchObject([{ id: 'first', status: 'failed' }, { id: 'second', retryOf: 'first', userMessageId: 'u1', status: 'completed' }]);
    expect(runtime.agent.state).toMatchObject({ h3Composer: { text: 'typed while streaming' }, h3Versions: [{ id: 'local-v' }] });
  } finally { errors.mockRestore(); await registry.disposeAll(); }
});

it('finalizes cancellation even if the provider has not yielded after abort', async () => {
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const graph = { stream: async function* () { started(); await new Promise<void>(resolve => { release = resolve; }); } };
  const registry = createPromptRuntimeRegistry(() => new H3AgUiAgent(graph));
  const runtime = registry.ensure({ apiKey: 'key', endpoint: 'https://invalid.test', model: 'h3', timeoutMs: 1000, maxRetries: 0 }, {
    threadId: 'cancel-thread', messages: [{ id: 'u1', role: 'user', content: 'original' }], state: {}, createdAt: 1, updatedAt: 1,
  }, { save: async () => undefined } as unknown as LocalThreadStore);
  const run = runtime.agent.runAgent({ runId: 'cancel-id' });
  try {
    await began;
    runtime.agent.abortRun();
    const completed = await Promise.race([run.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 50))]);
    expect(completed).toBe(true);
    expect(runtime.agent.isRunning).toBe(false);
    expect(readPromptRuns(runtime.getSnapshot().state)).toMatchObject([{ id: 'cancel-id', status: 'cancelled' }]);
  } finally { release(); await run; await registry.disposeAll(); }
});
