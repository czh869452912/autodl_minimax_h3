jest.mock('@ag-ui/client', () => ({ AbstractAgent: class { agentId = 'test'; description = 'test'; messages: any[] = []; addMessage(message: any) { this.messages.push(message); } }, }));
jest.mock('@ag-ui/core', () => ({ EventType: { RUN_STARTED: 'RUN_STARTED', TOOL_CALL_START: 'TOOL_CALL_START', TOOL_CALL_ARGS: 'TOOL_CALL_ARGS', TOOL_CALL_END: 'TOOL_CALL_END', TEXT_MESSAGE_START: 'TEXT_MESSAGE_START', TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT', TEXT_MESSAGE_END: 'TEXT_MESSAGE_END', RUN_FINISHED: 'RUN_FINISHED', RUN_ERROR: 'RUN_ERROR', TOOL_CALL_RESULT: 'TOOL_CALL_RESULT' } }));
import { EventType } from '@ag-ui/core';
import type { RunAgentInput } from '@ag-ui/client';
import { H3AgUiAgent } from './aguiAgent';

function collect(agent: H3AgUiAgent, input: RunAgentInput): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    agent.run(input).subscribe({ next: (event) => events.push(event), error: reject, complete: () => resolve(events) });
  });
}

it('bridges DeepAgents stream into official AG-UI lifecycle events', async () => {
  let graphInput: any;
  const graph = { stream: async function* (input: any) {
    graphInput = input;
    yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [{ id: 'tool-1', name: 'read_file', args: { path: '/skills/h3-prompt-writing/SKILL.md' } }] }, {}];
    yield [{ id: 'assistant-1', type: 'ai', content: '完成' }, {}];
  } };
  const events = await collect(new H3AgUiAgent(graph as never), { threadId: 't1', runId: 'r1', state: {}, messages: [] } as never);
  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED, EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END, EventType.TEXT_MESSAGE_START, EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END, EventType.RUN_FINISHED,
  ]);
  expect(Object.keys(graphInput.files).some((path) => path.startsWith('/skills/'))).toBe(true);
});

it('emits one AG-UI tool lifecycle when DeepAgents repeats a cumulative tool call', async () => {
  const repeatedCall = { id: 'tool-1', name: 'read_file', args: { path: '/skills/h3-prompt-writing/SKILL.md' } };
  const graph = { stream: async function* () {
    yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [repeatedCall] }, {}];
    yield [{ id: 'assistant-1', type: 'ai', content: '', tool_calls: [repeatedCall] }, {}];
    yield [{ id: 'tool-message-1', type: 'tool', tool_call_id: 'tool-1', content: 'skill loaded' }, {}];
  } };

  const events = await collect(new H3AgUiAgent(graph as never), { threadId: 't1', runId: 'r1', state: {}, messages: [] } as never);
  for (const type of [EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT]) {
    expect(events.filter((event) => event.type === type)).toHaveLength(1);
  }
});

it('keeps the official chat message renderable and sends selected images to DeepAgents', async () => {
  let graphInput: any;
  const agent = new H3AgUiAgent({ stream: async function* (input: any) { graphInput = input; } } as never);
  agent.setPendingAttachments([{
    id: 'image-1',
    type: 'image',
    source: { type: 'data', value: 'base64-data', mimeType: 'image/png' },
    filename: 'reference.png',
    status: 'ready',
  }] as never);

  agent.addMessage({ id: 'user-1', role: 'user', content: 'describe this image' } as never);
  expect((agent as any).messages[0]).toMatchObject({
    content: 'describe this image',
    attachments: [{ id: 'image-1', type: 'image', filename: 'reference.png' }],
  });

  await collect(agent, { threadId: 't1', runId: 'r1', state: {}, messages: (agent as any).messages } as never);
  expect(graphInput.messages[0].content).toEqual([
    { type: 'text', text: 'describe this image' },
    {
      type: 'image',
      source_type: 'base64',
      data: 'base64-data',
      mime_type: 'image/png',
    },
  ]);
});

it('normalizes CopilotKit tool result messages before sending history to DeepAgents', async () => {
  let graphInput: any;
  const graph = { stream: async function* (input: any) { graphInput = input; } };
  const toolResult = {
    id: 'run-tool-call-result',
    toolCallId: 'call_123',
    content: '/skills/README.md',
    tool: 'tool',
  };

  await collect(new H3AgUiAgent(graph as never), {
    threadId: 't1', runId: 'r2', state: {}, messages: [toolResult],
  } as never);

  expect(graphInput.messages).toEqual([{
    role: 'tool', content: '/skills/README.md', tool_call_id: 'call_123',
  }]);
});

it('normalizes DeepAgents failures into an Error-backed RUN_ERROR event', async () => {
  const graph = { stream: async function* () { throw new TypeError('provider failed'); } };
  const events = await collect(new H3AgUiAgent(graph as never), { threadId: 't1', runId: 'r1', state: {}, messages: [] } as never);
  expect(events.at(-1)).toMatchObject({ type: EventType.RUN_ERROR, message: 'provider failed', rawEvent: expect.any(Error) });
});
