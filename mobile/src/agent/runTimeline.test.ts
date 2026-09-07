import { normalizeMessages } from './agentPresentation';
import { enrichRunTools, projectRunTimeline } from './runTimeline';
import { reducePromptRunEvent, type PromptRun } from './runState';

const run: PromptRun = { id: 'r', userMessageId: 'u', status: 'completed', startedAt: 1, endedAt: 9, messageIds: ['a', 'b'], tools: [{ id: 't', name: 'read_file', status: 'complete', startedAt: 2, endedAt: 3 }] };
it('does not allocate a run for repeated text deltas after its activity is recorded', () => {
  const first = reducePromptRunEvent({ ...run, status: 'running' }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'A' }, 2);
  expect(reducePromptRunEvent(first, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'B' }, 3)).toBe(first);
});
it('places orphaned historical runs before the retained transcript', () => {
  const rows = normalizeMessages([{ id: 'new-user', role: 'user', content: 'Latest' }]);
  expect(projectRunTimeline(rows, [run], []).map(row => row.id)).toEqual(['run-r', 'new-user']);
});
it('recovers old tool arguments and full results without changing persisted records', () => {
  const result = enrichRunTools([run], [{ role: 'assistant', toolCalls: [{ id: 't', function: { arguments: '{"path":"/guide.md"}' } }] }, { role: 'tool', toolCallId: 't', content: 'full output' }]);
  expect(result[0].tools[0]).toMatchObject({ arguments: '{"path":"/guide.md"}', output: 'full output' });
  expect(run.tools[0].output).toBeUndefined();
});
it('groups intermediate replies and tools before the final answer without duplicating them', () => {
  const rows = normalizeMessages([{ id: 'u', role: 'user', content: 'Go' }, { id: 'a', role: 'assistant', content: 'Checking references', toolCalls: [{ id: 't', function: { name: 'read_file' } }] }, { id: 'b', role: 'assistant', content: 'Final answer' }]);
  const result = projectRunTimeline(rows, [run], ['b']);
  expect(result.map(row => row.id)).toEqual(['u', 'run-r', 'b']);
  expect(result[1]).toMatchObject({ entries: [{ kind: 'text', text: 'Checking references' }, { kind: 'tool', tool: { id: 't' } }] });
});
it('keeps partial output in a failed attempt and does not consume the next turn', () => {
  const rows = normalizeMessages([{ id: 'u', role: 'user', content: 'Go' }, { id: 'a', role: 'assistant', content: 'Partial' }, { id: 'u2', role: 'user', content: 'Next' }]);
  expect(projectRunTimeline(rows, [{ ...run, status: 'failed' }], []).map(row => row.id)).toEqual(['u', 'run-r', 'u2']);
});
it.each([false, true])('keeps final prose and prompt together with activity ledger=%s', withLedger => {
  const finalText = 'Here is the H3 prompt:\n```h3-prompt\nintegrated_multimodal_description: Running in the dark.\noverall_soundscape: Wind.\nnon_diegetic_music: None.\n```\nFinal notes.';
  const rows = normalizeMessages([{ id: 'a', role: 'assistant', content: 'Checking references' }, { id: 'b', role: 'assistant', content: finalText }]);
  expect(rows[1]).toMatchObject({ candidates: [expect.anything()] });
  const result = projectRunTimeline(rows, [{ ...run, activities: withLedger ? [{ id: 'text:a', kind: 'text', messageId: 'a' }, { id: 'text:b', kind: 'text', messageId: 'b' }] : undefined }], ['b']);
  expect(result.at(-1)).toBe(rows[1]);
  const process = result[0];
  expect(process.kind).toBe('run');
  if (process.kind === 'run') expect(process.entries.filter(entry => entry.kind === 'text')).toEqual([{ id: 'text:a', kind: 'text', text: 'Checking references' }]);
});
it('persists ordered reasoning, text, tool arguments and complete results', () => {
  let state: PromptRun = { ...run, status: 'running', messageIds: [], tools: [] };
  for (const event of [
    { type: 'CUSTOM', name: 'h3.reasoning', value: { messageId: 'a', delta: 'Inspect reference' } },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Reading' },
    { type: 'TOOL_CALL_START', parentMessageId: 'a', toolCallId: 't', toolCallName: 'read_file' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 't', delta: '{"path":"/guide"}' },
    { type: 'TOOL_CALL_RESULT', toolCallId: 't', content: 'Full result'.repeat(100) },
  ]) state = reducePromptRunEvent(state, event, 2);
  expect(state.activities?.map(entry => entry.kind)).toEqual(['reasoning', 'text', 'tool']);
  expect(state.tools[0]).toMatchObject({ arguments: '{"path":"/guide"}', output: 'Full result'.repeat(100), parentMessageId: 'a' });
});
