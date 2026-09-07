jest.mock('deepagents/browser', () => ({ createDeepAgent: jest.fn(), StateBackend: jest.fn() }));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
jest.mock('./agentWorkspace', () => ({ createH3WorkspaceBackend: jest.fn(), createH3WorkspaceMiddleware: () => [], getH3ContextBudget: () => ({ inputTokens: 28672, outputTokens: 4096 }) }));
import { normalizeCumulativeText, streamH3Agent } from './h3Agent';
import type { H3AgentEvent } from './agentTypes';

describe('local H3 DeepAgent harness', () => {
  it('normalizes cumulative streaming text into deltas', () => {
    expect(normalizeCumulativeText('hello', 'hello world')).toEqual({ previous: 'hello world', delta: ' world' });
  });

  it('forwards real multi-round tool events without a remote runtime', async () => {
    const scripted = async function* (): AsyncGenerator<H3AgentEvent> {
      yield { type: 'tool-start', id: 'read-1', name: 'read_file', args: { path: '/skills/h3-prompt-writing/SKILL.md' } };
      yield { type: 'tool-end', id: 'read-1' };
      yield { type: 'text', delta: 'integrated_multimodal_description:', phase: 'final' };
    };
    const events: H3AgentEvent[] = [];
    for await (const event of streamH3Agent(
      { threadId: 'thread-1', messages: [{ role: 'user', content: '写一个视频提示词' }], signal: new AbortController().signal },
      { apiKey: 'test', endpoint: 'https://llm.example.test/v1', model: 'test-model', timeoutMs: 600000, maxRetries: 2 },
      { agentFactory: scripted },
    )) events.push(event);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-start', name: 'read_file' }),
      expect.objectContaining({ type: 'text', phase: 'final' }),
    ]));
  });

  it('stops yielding after cancellation', async () => {
    const controller = new AbortController();
    const scripted = async function* (): AsyncGenerator<H3AgentEvent> {
      controller.abort();
      yield { type: 'text', delta: 'must not escape', phase: 'final' };
    };
    const events: H3AgentEvent[] = [];
    for await (const event of streamH3Agent(
      { threadId: 'thread-1', messages: [], signal: controller.signal },
      { apiKey: 'test', endpoint: 'https://llm.example.test/v1', model: 'test-model', timeoutMs: 600000, maxRetries: 2 },
      { agentFactory: scripted },
    )) events.push(event);
    expect(events).toEqual([]);
  });
});

const { AIMessageChunk, AIMessage, ToolMessage } = require('@langchain/core/messages');
const { createDeepAgent } = require('deepagents/browser');
it('adapts actual graph chunks without lost tokens or prematurely completed tool arguments', async () => {
  createDeepAgent.mockReturnValue({ stream: async function* () {
    yield [new AIMessageChunk({ id: 'tool-model', content: 'checking', tool_call_chunks: [{ id: 'call', name: 'read_file', index: 0, args: '{"path":' }] }), {}];
    yield [new AIMessageChunk({ id: 'tool-model', content: '', tool_call_chunks: [{ index: 0, args: '"/skill"}' }] }), {}];
    yield [new ToolMessage({ id: 'result', tool_call_id: 'call', content: 'skill contents' }), {}];
    for (const content of ['ha', 'ha', '!', '\n', '\n']) yield [new AIMessageChunk({ id: 'answer', content }), {}];
    yield [new AIMessage({ id: 'answer', content: 'haha!\n\n' }), {}];
  } });
  const events: H3AgentEvent[] = [];
  for await (const event of streamH3Agent(
    { threadId: 'thread-1', messages: [], signal: new AbortController().signal },
    { apiKey: 'test', endpoint: 'https://llm.example.test/v1', model: 'test-model', timeoutMs: 600000, maxRetries: 2 },
    { modelFactory: (() => ({})) as never },
  )) events.push(event);
  expect(events.filter(e => e.type === 'text' && e.phase === 'final').map(e => (e as any).delta).join('')).toBe('haha!\n\n');
  expect(events.filter(e => e.type === 'tool-start')).toEqual([{ type: 'tool-start', id: 'call', name: 'read_file', args: { path: '/skill' } }]);
  expect(events.filter(e => e.type === 'tool-end')).toEqual([{ type: 'tool-end', id: 'call' }]);
  expect(events).toContainEqual({ type: 'text', delta: 'checking', phase: 'thinking' });
});

it('does not report legacy tool execution ended without a real result', async () => {
  createDeepAgent.mockReturnValue({ stream: async function* () {
    yield [new AIMessage({ id: 'model', content: '', tool_calls: [{ id: 'call', name: 'read_file', args: { path: '/skill' } }] }), {}];
  } });
  const events: H3AgentEvent[] = [];
  for await (const event of streamH3Agent(
    { threadId: 'thread-1', messages: [], signal: new AbortController().signal },
    { apiKey: 'test', endpoint: 'https://llm.example.test/v1', model: 'test-model', timeoutMs: 600000, maxRetries: 2 },
    { modelFactory: (() => ({})) as never },
  )) events.push(event);
  expect(events.filter(e => e.type === 'tool-end')).toEqual([]);
  expect(events.filter(e => e.type === 'tool-start')).toEqual([{ type: 'tool-start', id: 'call', name: 'read_file', args: { path: '/skill' } }]);
});
