jest.mock('deepagents/browser', () => ({ createDeepAgent: jest.fn(), StateBackend: jest.fn() }));
jest.mock('@langchain/openai', () => ({ ChatOpenAI: jest.fn() }));
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
      { apiKey: 'test', endpoint: 'https://llm.example.test/v1', model: 'test-model' },
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
      { apiKey: 'test', endpoint: 'https://llm.example.test/v1', model: 'test-model' },
      { agentFactory: scripted },
    )) events.push(event);
    expect(events).toEqual([]);
  });
});
