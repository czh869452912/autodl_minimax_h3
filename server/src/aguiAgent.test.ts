import { EventType } from '@ag-ui/core';
import type { RunAgentInput } from '@ag-ui/client';
import { H3AgUiAgent } from './aguiAgent.js';

function collect(agent: H3AgUiAgent, input: RunAgentInput): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    agent.run(input).subscribe({ next: (event) => events.push(event), error: reject, complete: () => resolve(events) });
  });
}

describe('DeepAgents to AG-UI adapter', () => {
  it('emits lifecycle, text, tool, and finish events', async () => {
    const graph = {
      stream: async function* () {
        yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [{ id: 'tool-1', name: 'read_file', args: { path: '/skills/minimax-h3/h3-prompt-writing/SKILL.md' } }] }, {}];
        yield [{ id: 'assistant-1', type: 'ai', content: '完成' }, {}];
      },
    };
    const agent = new H3AgUiAgent(graph as any);
    const events = await collect(agent, {
      threadId: 'thread-1', runId: 'run-1', state: {}, messages: [{ id: 'user-1', role: 'user', content: '写 prompt' }],
    } as unknown as RunAgentInput);
    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events.find((event) => event.type === EventType.TEXT_MESSAGE_CONTENT).delta).toBe('完成');
  });

  it('converts cumulative DeepAgents message chunks into text deltas', async () => {
    const graph = {
      stream: async function* () {
        yield [{ id: 'assistant-1', type: 'ai', content: '第' }];
        yield [{ id: 'assistant-1', type: 'ai', content: '第二' }];
      },
    };
    const events = await collect(new H3AgUiAgent(graph as any), {
      threadId: 'thread-1', runId: 'run-2', state: {}, messages: [],
    } as unknown as RunAgentInput);
    expect(events.filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT).map((event) => event.delta)).toEqual(['第', '二']);
  });

  it('emits a visible AG-UI error event when the graph fails', async () => {
    const graph = { stream: async function* () { throw new Error('provider unavailable'); } };
    const events = await collect(new H3AgUiAgent(graph as any), {
      threadId: 'thread-1', runId: 'run-3', state: {}, messages: [],
    } as unknown as RunAgentInput);
    expect(events.at(-1)).toMatchObject({ type: EventType.RUN_ERROR, message: 'provider unavailable' });
  });
});
