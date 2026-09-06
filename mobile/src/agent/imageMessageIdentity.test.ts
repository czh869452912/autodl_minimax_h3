import { applyImageIdentities } from './imageMessageIdentity';
import { normalizeMessages } from './agentPresentation';

it('preserves image identity and mention target after deleting an earlier attachment and restoring JSON', () => {
  const original = {
    id: 'u', role: 'user',
    content: [
      { type: 'text', text: '使用 @图片2，不要 @图片3' },
      { type: 'image', source: { type: 'url', value: 'https://example.test/b' } },
    ],
    attachments: [{ id: 'c', type: 'image', source: { type: 'url', value: 'https://example.test/c' } }],
  };
  const message = applyImageIdentities(original, [
    { attachmentId: 'b', displayName: '图片2' },
    { attachmentId: 'c', displayName: '图片3' },
  ]);
  const restored = JSON.parse(JSON.stringify(message));
  expect(normalizeMessages([restored])[0]).toMatchObject({ attachments: [
    { attachmentId: 'b', displayName: '图片2', uri: 'https://example.test/b' },
    { attachmentId: 'c', displayName: '图片3', uri: 'https://example.test/c' },
  ] });
  expect(restored.imageMentions).toEqual([
    { attachmentId: 'b', label: '@图片2', start: 3, end: 7 },
    { attachmentId: 'c', label: '@图片3', start: 11, end: 15 },
  ]);
  expect(original.content[1]).not.toHaveProperty('metadata');
});

it('keeps legacy attachment numbering and handles attachment-only messages', () => {
  const message = applyImageIdentities({ role: 'user', content: '使用 @图片3', attachments: [
    { type: 'image', source: { type: 'url', value: 'https://example.test/c' } },
  ] }, [{ attachmentId: 'c', displayName: '图片3' }]);
  expect(normalizeMessages([message])[0]).toMatchObject({ attachments: [{ displayName: '图片3' }] });
  expect(normalizeMessages([{ role: 'user', attachments: [{ type: 'image', source: { value: 'legacy' } }] }])[0])
    .toMatchObject({ attachments: [{ displayName: '图片1' }] });
});
