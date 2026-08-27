import { describe, expect, it } from 'vitest';
import { collectDeepAgentEvents } from './deepAgent';

describe('Deep Agents AG-UI adapter', () => {
  it('converts streamed text chunks into a complete assistant message', async () => {
    const events = await collectDeepAgentEvents(
      (async function* () {
        yield [{ content: '第一轮分析' }, { langgraph_node: 'model' }];
        yield [{ content: '第二轮迭代' }, { langgraph_node: 'model' }];
      })(),
      'run-1',
    );

    expect(events.map((event) => event.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(events.filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')).toEqual([
      expect.objectContaining({ delta: '第一轮分析' }),
      expect.objectContaining({ delta: '第二轮迭代' }),
    ]);
  });

  it('surfaces tool calls as AG-UI trajectory events', async () => {
    const events = await collectDeepAgentEvents(
      (async function* () {
        yield [{ tool_calls: [{ id: 'call-1', name: 'read_file', args: { path: 'SKILL.md' } }] }, {}];
        yield [{ content: '读取完成' }, {}];
      })(),
      'run-2',
    );

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'TOOL_CALL_START', toolCallName: 'read_file' }),
      expect.objectContaining({ type: 'TOOL_CALL_ARGS', delta: expect.stringContaining('SKILL.md') }),
    ]));
  });
});
