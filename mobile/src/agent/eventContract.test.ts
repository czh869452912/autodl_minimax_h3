import { decodeH3CustomEvent, H3_EVENTS } from './eventContract';
import { reducePromptRunEvent, type PromptRun } from './runState';

test('malformed and future custom events leave a running transcript intact', () => {
  const run: PromptRun = { id: 'r', userMessageId: 'u', status: 'running', startedAt: 1, messageIds: [], tools: [] };
  for (const event of [
    { type: 'CUSTOM', name: 'h3.future', value: {} },
    { type: 'CUSTOM', name: H3_EVENTS.reasoning, value: { messageId: 'm', delta: {} } },
    { type: 'CUSTOM', name: H3_EVENTS.workspace, value: { runId: 'r', workspace: null } },
  ]) {
    expect(decodeH3CustomEvent(event)).toBeUndefined();
    expect(reducePromptRunEvent(run, event, 2)).toBe(run);
  }
});

test('workspace validation retains additional persisted fields', () => {
  const workspace = { revision: 2, files: {}, futureField: { keep: true } };
  expect(decodeH3CustomEvent({ type: 'CUSTOM', name: H3_EVENTS.workspace, value: { runId: 'r', workspace } })).toMatchObject({ value: { workspace } });
});
