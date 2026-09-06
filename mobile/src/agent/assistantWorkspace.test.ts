import { readComposerDraft, insertRunRows, sessionRunLabel } from './assistantWorkspace';
import { normalizeMessages } from './agentPresentation';

it('restores only usable draft images and preserves their identity', () => {
  expect(readComposerDraft({ h3Composer: { text: '@图片3 修改镜头', attachments: [
    { id: 'i3', type: 'image', status: 'ready', displayName: '图片3', source: { type: 'data', value: 'YWJj', mimeType: 'image/png' } },
    { id: 'pending', status: 'uploading' },
  ] } })).toMatchObject({ text: '@图片3 修改镜头', attachments: [{ id: 'i3', displayName: '图片3' }] });
});
it('anchors failed attempts beside their output instead of replacing history', () => {
  const runs = [{ id: 'r1', userMessageId: 'u1', status: 'failed' as const, startedAt: 1, endedAt: 4, messageIds: ['a1'], tools: [] }];
  const rows = normalizeMessages([{ id: 'u1', role: 'user', content: 'first' }, { id: 'a1', role: 'assistant', content: 'partial' }, { id: 'u2', role: 'user', content: 'next' }]);
  expect(insertRunRows(rows, runs).map(row => row.id)).toEqual(['u1', 'a1', 'run-r1', 'u2']);
  expect(sessionRunLabel({ h3Runs: runs, h3ReadAt: 2 })).toBe('失败 · 未读');
});
it('does not infer failure from words in a successful tool result', () => {
  const rows = normalizeMessages([{ id: 'a', role: 'assistant', toolCalls: [{ id: 't', function: { name: 'read_file' } }] }, { role: 'tool', toolCallId: 't', content: 'Avoid errors and failure' }]);
  expect(rows[0]).toMatchObject({ tools: [{ status: 'complete' }] });
});
