import { normalizeModelTranscript } from './modelTranscript';
import { coerceMessageLikeToMessage } from '@langchain/core/messages';

it.each(['toolCalls', 'tool_calls'])('degrades malformed paired %s into bounded diagnostics and preserves valid history', (key) => {
  const history = [
    { id: 'u1', role: 'user', content: 'first' },
    { id: 'a1', role: 'assistant', content: 'partial text', [key]: [
      { id: 'bad', function: { name: 'read_file', arguments: '{broken' } },
      { id: 'good', function: { name: 'read_file', arguments: '{}' } },
      { id: 'unexecuted', function: { name: 'read_file', arguments: '{}' } },
    ] },
    { role: 'tool', toolCallId: 'bad', content: 'x'.repeat(10000) },
    { tool: 'tool', toolCallId: 'good', content: 'valid result' },
    { role: 'tool', tool_call_id: 'orphan', content: 'orphan' },
    { id: 'u2', role: 'user', content: 'follow up' },
  ];
  const saved = JSON.stringify(history);
  const result = normalizeModelTranscript(history as never) as any[];
  expect(result.map(coerceMessageLikeToMessage)).toHaveLength(5);
  expect(result[1].content).toBe('partial text');
  expect(result[1].tool_calls.map((call: any) => call.id)).toEqual(['good']);
  const diagnostic = result.find(message => typeof message.content === 'string' && message.content.includes('malformed'));
  expect(diagnostic.role).toBe('assistant');
  expect(diagnostic.content).toMatch(/bad/);
  expect(diagnostic.content).toMatch(/unverified/i);
  expect(diagnostic.content.length).toBeLessThanOrEqual(1024);
  expect(result.some(message => message.tool_call_id === 'bad' || message.tool_call_id === 'orphan')).toBe(false);
  expect(result.at(-1).content).toBe('follow up');
  expect(JSON.stringify(history)).toBe(saved);
});

it.each(['assistant', 'user'])('removes interrupted tool pairs across a %s message while retaining ordinary text', (role) => {
  const history = [
    { id: 'a', role: 'assistant', content: 'original text', toolCalls: [{ id: 'interrupted', function: { name: 'read_file', arguments: '{}' } }] },
    { id: 'between', role, content: 'intervening text' },
    { id: 'late-result', role: 'tool', toolCallId: 'interrupted', content: 'unverified result' },
    { id: 'b', role: 'assistant', content: 'valid text', toolCalls: [{ id: 'valid', function: { name: 'read_file', arguments: '{}' } }] },
    { id: 'valid-result', role: 'tool', toolCallId: 'valid', content: 'verified result' },
    { id: 'last', role: 'user', content: 'follow up' },
  ];
  const original = JSON.stringify(history);
  const result = normalizeModelTranscript(history) as any[];
  expect(result[0].tool_calls).toEqual([]);
  expect(result.filter(message => message.id).map(message => message.content)).toEqual(['original text', 'intervening text', 'valid text', 'follow up']);
  expect(result.filter(message => message.role === 'tool')).toEqual([{ role: 'tool', tool_call_id: 'valid', content: 'verified result' }]);
  expect(result.find(message => message.id === 'b').tool_calls[0].id).toBe('valid');
  expect(result.map(coerceMessageLikeToMessage).at(-1)?.content).toBe('follow up');
  expect(JSON.stringify(history)).toBe(original);
});
