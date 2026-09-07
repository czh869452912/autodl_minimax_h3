jest.mock('../shims/copilotKitStreamingFetch', () => ({ createStreamingFetch: jest.fn() }));
jest.mock('yaml', () => jest.requireActual(require('path').join(require.resolve('yaml/package.json'), '..', 'dist', 'index.js')));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
import { AIMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createDeepAgent, createSummarizationMiddleware } from 'deepagents/browser';
import { createH3Agent } from './h3Agent';
import { captureWorkspaceState, prepareWorkspaceRun, createH3WorkspaceBackend, createH3WorkspaceMiddleware, getH3ContextBudget } from './agentWorkspace';

class ScriptedModel extends BaseChatModel {
  responses: AIMessage[];
  received: any[][] = [];
  constructor(responses: AIMessage[]) { super({}); this.responses = responses; }
  _llmType() { return 'h3-contract-test'; }
  bindTools() { return this; }
  async _generate(messages: any[]) {
    this.received.push(messages);
    return { generations: [{ text: '', message: this.responses.shift() ?? new AIMessage('done') }] };
  }
}
const config = { apiKey: 'test', endpoint: 'https://example.test/v1', model: 'unknown-model', timeoutMs: 1000, maxRetries: 0 };
const call = (name: string, args: Record<string, unknown>, id = name) => new AIMessage({ content: '', tool_calls: [{ id, name, args }] });

it('keeps bundled skills readable but rejects modifications in a real graph', async () => {
  const model = new ScriptedModel([
    call('write_file', { file_path: '/skills/forbidden.md', content: 'changed' }),
    call('read_file', { file_path: '/skills/README.md' }), new AIMessage('done'),
  ]);
  const agent = createH3Agent(config, { modelFactory: (() => model) as never });
  const result = await agent.invoke({ messages: [{ role: 'user', content: 'inspect' }] });
  const tools = result.messages.filter((message: any) => message.getType() === 'tool');
  expect(String(tools[0].content)).toMatch(/read.only/i);
  expect(JSON.stringify(tools[1].content)).not.toMatch(/not found/i);
  expect(Object.keys(result.files ?? {}).some(path => path.startsWith('/skills/'))).toBe(false);
});

async function valuesOf(agent: any, prepared: ReturnType<typeof prepareWorkspaceRun>) {
  let state: any;
  for await (const [mode, value] of await agent.stream(prepared.input, { context: prepared.context, streamMode: ['messages', 'values'] })) {
    if (mode === 'values') state = value;
  }
  return state;
}

it('restores workspace files and todos across fresh graphs while isolating a fresh thread and retry baseline', async () => {
  const firstModel = new ScriptedModel([
    call('write_file', { file_path: '/workspace/note.txt', content: 'original' }),
    call('write_todos', { todos: [{ content: 'Continue', status: 'pending' }] }), new AIMessage('done'),
  ]);
  const first = createH3Agent(config, { modelFactory: (() => firstModel) as never });
  const state = await valuesOf(first, prepareWorkspaceRun(undefined, [{ role: 'user', content: 'write' }]));
  const saved = captureWorkspaceState(state, 1);
  expect(saved.todos).toEqual([{ content: 'Continue', status: 'pending' }]);
  expect(saved.files['/workspace/note.txt'].content).toBe('original');
  const model = new ScriptedModel([call('read_file', { file_path: '/workspace/note.txt' }), new AIMessage('done')]);
  const next = createH3Agent(config, { modelFactory: (() => model) as never });
  const restored = await valuesOf(next, prepareWorkspaceRun(JSON.parse(JSON.stringify(saved)), [{ role: 'user', content: 'read' }]));
  expect(JSON.stringify(restored.messages.find((m: any) => m.getType() === 'tool').content)).toContain('original');
  expect(prepareWorkspaceRun(undefined, []).input.files).toEqual({});
  const changed = captureWorkspaceState({ ...state, files: { '/workspace/note.txt': { ...state.files['/workspace/note.txt'], content: 'future' } } }, 2);
  expect(prepareWorkspaceRun(saved, []).input.files['/workspace/note.txt'].content).toBe('original');
  expect(prepareWorkspaceRun(changed, []).input.files['/workspace/note.txt'].content).toBe('future');
});

it('captures and restores the real private summary only for its exact transcript prefix and budget', async () => {
  const backend = createH3WorkspaceBackend();
  const budget = getH3ContextBudget(config);
  const model = new ScriptedModel([new AIMessage('short summary'), new AIMessage('answer')]);
  const graph = createDeepAgent({ model, backend, middleware: [
    ...createH3WorkspaceMiddleware(backend, budget),
    createSummarizationMiddleware({ backend, trigger: { type: 'messages', value: 3 }, keep: { type: 'messages', value: 1 } }),
  ] });
  const messages = [{ id: 'u1', role: 'user', content: 'old question' }, { id: 'a1', role: 'assistant', content: 'old answer' }, { id: 'u2', role: 'user', content: 'new question' }];
  const state = await valuesOf(graph, prepareWorkspaceRun(undefined, messages));
  const saved = captureWorkspaceState(state, 1);
  expect(saved.summary?.cutoffIndex).toBe(2);
  const nextModel = new ScriptedModel([new AIMessage('continued')]);
  const next = createH3Agent(config, { modelFactory: (() => nextModel) as never });
  await valuesOf(next, prepareWorkspaceRun(JSON.parse(JSON.stringify(saved)), messages));
  expect(nextModel.received[0].some(m => m.content === 'old question')).toBe(false);
  expect(nextModel.received[0].some(m => String(m.content).includes('short summary'))).toBe(true);
  expect(prepareWorkspaceRun(saved, messages.slice(0, 1)).context.h3Summary).toBeUndefined();
  expect(prepareWorkspaceRun(saved, [{ ...messages[0], content: 'changed' }, ...messages.slice(1)]).context.h3Summary).toBeUndefined();
  expect(prepareWorkspaceRun(saved, messages, { ...budget, inputTokens: budget.inputTokens + 1 }).context.h3Summary).toBeUndefined();
});

it('rejects binary, oversized and malformed workspace state and copies only the whitelist', () => {
  expect(() => captureWorkspaceState({ files: { '/image': { content: new Uint8Array([1]) } } }, 1)).toThrow(/text/i);
  expect(() => captureWorkspaceState({ files: { '/large': { content: 'x'.repeat(1024 * 1024 + 1) } } }, 1)).toThrow(/budget/i);
  const saved = captureWorkspaceState({ files: {}, todos: [], h3Composer: { text: 'private' } }, 1);
  expect(JSON.stringify(saved)).not.toContain('h3Composer');
  expect(() => prepareWorkspaceRun({ ...saved, schemaVersion: 999 }, [])).toThrow(/version/i);
});

it('reserves image tokens and rejects over-budget input before the model request', async () => {
  const model = new ScriptedModel([new AIMessage('must not execute')]);
  const backend = createH3WorkspaceBackend();
  const graph = createDeepAgent({ model, backend, middleware: createH3WorkspaceMiddleware(backend, { inputTokens: 16000, outputTokens: 4096 }) });
  const message = { role: 'user', content: Array.from({ length: 9 }, () => ({ type: 'image_url', image_url: { url: 'https://example.test/image.jpg' } })) };
  await expect(graph.invoke({ messages: [message] as never })).rejects.toThrow(/context budget/i);
  expect(model.received).toHaveLength(0);
});

it.each(['https://example.test/reference.jpg', 'data:image/png;base64,aGVsbG8='])('retains selected historical images when summarized: %s', async (imageUrl) => {
  const backend = createH3WorkspaceBackend();
  const model = new ScriptedModel([new AIMessage('summary'), new AIMessage('answer')]);
  const graph = createDeepAgent({ model, backend, middleware: [
    ...createH3WorkspaceMiddleware(backend),
    createSummarizationMiddleware({ backend, trigger: { type: 'messages', value: 3 }, keep: { type: 'messages', value: 1 } }),
  ] });
  const image = { type: 'image_url', image_url: { url: imageUrl } };
  const state = await valuesOf(graph, prepareWorkspaceRun(undefined, [
    { role: 'user', content: [{ type: 'text', text: 'reference' }, image] },
    { role: 'assistant', content: 'description' }, { role: 'user', content: 'continue with this image' },
  ]));
  expect(JSON.stringify(model.received.at(-1))).toContain(imageUrl);
  expect(JSON.stringify(captureWorkspaceState(state, 1))).not.toContain('data:image/');
});
