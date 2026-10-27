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
  expect(projectRunTimeline(rows, [run], []).map(row => row.id)).toEqual(['run-r-u-after', 'new-user']);
});
it('recovers old tool arguments and full results without changing persisted records', () => {
  const result = enrichRunTools([run], [{ role: 'assistant', toolCalls: [{ id: 't', function: { arguments: '{"path":"/guide.md"}' } }] }, { role: 'tool', toolCallId: 't', content: 'full output' }]);
  expect(result[0].tools[0]).toMatchObject({ arguments: '{"path":"/guide.md"}', output: 'full output' });
  expect(run.tools[0].output).toBeUndefined();
});
it('groups intermediate replies and tools before the final answer without duplicating them', () => {
  const rows = normalizeMessages([{ id: 'u', role: 'user', content: 'Go' }, { id: 'a', role: 'assistant', content: 'Checking references', toolCalls: [{ id: 't', function: { name: 'read_file' } }] }, { id: 'b', role: 'assistant', content: 'Final answer' }]);
  const result = projectRunTimeline(rows, [run], ['b']);
  expect(result.map(row => row.id)).toEqual(['u', 'a', 'run-r-a-after', 'b']);
  expect(result[2]).toMatchObject({ entries: [{ kind: 'tool', tool: { id: 't' } }] });
});
it('keeps partial output in a failed attempt and does not consume the next turn', () => {
  const rows = normalizeMessages([{ id: 'u', role: 'user', content: 'Go' }, { id: 'a', role: 'assistant', content: 'Partial' }, { id: 'u2', role: 'user', content: 'Next' }]);
  expect(projectRunTimeline(rows, [{ ...run, status: 'failed' }], []).map(row => row.id)).toEqual(['u', 'a', 'run-r-a-after', 'u2']);
});
it.each([false, true])('keeps final prose and prompt together with activity ledger=%s', withLedger => {
  const finalText = 'Here is the H3 prompt:\n```h3-prompt\nintegrated_multimodal_description: Running in the dark.\noverall_soundscape: Wind.\nnon_diegetic_music: None.\n```\nFinal notes.';
  const rows = normalizeMessages([{ id: 'a', role: 'assistant', content: 'Checking references' }, { id: 'b', role: 'assistant', content: finalText }]);
  expect(rows[1]).toMatchObject({ candidates: [expect.anything()] });
  const result = projectRunTimeline(rows, [{ ...run, activities: withLedger ? [{ id: 'text:a', kind: 'text', messageId: 'a' }, { id: 'text:b', kind: 'text', messageId: 'b' }] : undefined }], ['b']);
  expect(result.at(-1)).toBe(rows[1]);
  const process = result.find(row=>row.kind==='run')!;
  expect(process.kind).toBe('run');
  if (process.kind === 'run') expect(process.entries.filter(entry => entry.kind === 'text')).toEqual([]);
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

it('keeps steering messages between activity segments and never duplicates tools',()=>{
  const rows=normalizeMessages([{id:'u',role:'user',content:'Go'},{id:'a',role:'assistant',content:'Checking'},{id:'steer',role:'user',content:'Use blue'},{id:'b',role:'assistant',content:'Revising'}]);
  const result=projectRunTimeline(rows,[{...run,tools:[{...run.tools[0],parentMessageId:'a'},{...run.tools[0],id:'t2',parentMessageId:'b'}]}],['b']);
  expect(result.map(row=>row.id)).toEqual(['u','a','run-r-a-after','steer','b','run-r-b-after']);
  expect(result.flatMap(row=>row.kind==='run'?row.entries.map(e=>e.id):[])).toEqual(['t','t2']);
});

it('keeps reasoning before its reply and subsequent tools after it', () => {
  const rows = normalizeMessages([{id:'u',role:'user',content:'Go'}, {id:'a',role:'assistant',content:'Checking'}, {id:'b',role:'assistant',content:'Answer'}]);
  const result = projectRunTimeline(rows, [{...run,activities:[{id:'r1',kind:'reasoning',messageId:'a',text:'Reasoning'}, {id:'text:a',kind:'text',messageId:'a'}, {id:'t',kind:'tool',messageId:'a'}]}], ['b']);
  expect(result.map(row => row.kind==='run' ? row.entries.map(e=>e.kind).join(',') : row.text)).toEqual(['Go','reasoning','Checking','tool','Answer']);
});
it('does not falsely complete an earlier concurrent tool when another message arrives', () => {
  const rows=normalizeMessages([{id:'a',role:'assistant',content:'Starting'}, {id:'b',role:'assistant',content:'Another step'}]);
  const tools=[{...run.tools[0],status:'running' as const,endedAt:undefined,parentMessageId:'a'}, {...run.tools[0],id:'t2',parentMessageId:'b'}];
  const result=projectRunTimeline(rows,[{...run,status:'running',tools}],[]);
  expect(result.find(row=>row.kind==='run' && row.entries.some(e=>e.id==='t'))).toMatchObject({run:{status:'running',endedAt:undefined},terminal:false});
});
it('adding an earlier segment does not change an existing segment identity', () => {
  const rows=normalizeMessages([{id:'a',role:'assistant',content:'A'}, {id:'b',role:'assistant',content:'B'}]);
  const later={...run.tools[0],id:'t2',parentMessageId:'b'};
  const identity=(tools:typeof run.tools)=>projectRunTimeline(rows,[{...run,tools}],[]).find(row=>row.kind==='run' && row.entries.some(e=>e.id==='t2'))!.id;
  expect(identity([later])).toBe(identity([{...run.tools[0],parentMessageId:'a'},later]));
});

it('keeps early reasoning after the opening input and stable when the first reply arrives',()=>{
 const waiting=normalizeMessages([{id:'u',role:'user',content:'Go'}]);
 const state:PromptRun={...run,status:'running',tools:[],activities:[{id:'reason:a',kind:'reasoning',messageId:'a',text:'Checking'}]};
 const initial=projectRunTimeline(waiting,[state]);
 expect(initial[0]).toBe(waiting[0]);expect(initial[1]).toMatchObject({kind:'run',entries:[{kind:'reasoning'}]});
 const withReply=projectRunTimeline([...waiting,...normalizeMessages([{id:'a',role:'assistant',content:'Progress'}])],[state]);
 expect(withReply[1].id).toBe(initial[1].id);expect(withReply[2]).toMatchObject({text:'Progress'});
});
