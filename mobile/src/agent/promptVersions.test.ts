import { diffPromptVersions, readPromptVersions, reconcilePromptVersions, restorePromptVersion } from './promptVersions';

const prompt = 'integrated_multimodal_description: @图片7 runs.\noverall_soundscape: Wind.\nnon_diegetic_music: None.';
const assistant = (id?: string) => ({ id, role: 'assistant', content: `\`\`\`h3-prompt\n${prompt}\n\`\`\`` });
const user = (id: string, label: string) => ({ id, role: 'user', content: [{ type: 'image_url', image_url: { url: `file://${id}` }, metadata: { attachmentId: `attachment-${id}`, displayName: label, filename: `${id}.png` } }] });

it('creates each completed artifact once and retains its immutable image identity after later turns', () => {
  const messages = [user('u1', '图片7'), assistant('a1')];
  const versions = reconcilePromptVersions(messages, ['a1'], [], 100);
  expect(versions).toEqual([{ id: 'version-a1', sourceMessageId: 'a1', promptText: prompt, createdAt: 100, images: [{ id: 'attachment-u1', displayName: '图片7', filename: 'u1.png', uri: 'file://u1' }], parameters: {} }]);
  const next = reconcilePromptVersions([...messages, user('u2', '图片9'), assistant('a2')], ['a1', 'a2'], versions, 200);
  expect(next).toHaveLength(2);
  expect(next[0]).toEqual(versions[0]);
  expect(next[1].images.map((image) => image.id)).toEqual(['attachment-u2']);
  expect(versions).toHaveLength(1);
  expect(reconcilePromptVersions(messages, ['a1'], next, 300)).toEqual(next);
});

it('does not promote interrupted, legacy unidentified, or non-artifact messages', () => {
  expect(reconcilePromptVersions([null, assistant(), assistant('partial'), { id: 'chat', role: 'assistant', content: 'Just prose.' }], ['chat'], [], 1)).toEqual([]);
});

it('tolerates malformed legacy image parts while keeping valid references', () => {
  const original = user('u1', '图片7');
  const messages = [{ ...original, content: [null, ...original.content], attachments: [null] }, assistant('a')];
  expect(reconcilePromptVersions(messages, ['a'], [], 1)[0].images[0].id).toBe('attachment-u1');
});

it('keeps latest image candidates for a text-only refinement without combining older turns', () => {
  const messages = [user('old', '图片1'), user('new', '图片7'), { id: 'refine', role: 'user', content: 'Faster.' }, assistant('a')];
  expect(reconcilePromptVersions(messages, ['a'], [], 1)[0].images.map((image) => image.id)).toEqual(['attachment-new']);
});

it('binds a retry artifact to its original user image context even after newer conversations', () => {
  const messages = [user('u1', '图片1'), assistant('partial'), user('u2', '图片1'), assistant('a2'), assistant('retry')];
  const runs = [{ id: 'r', userMessageId: 'u1', status: 'completed' as const, startedAt: 1, messageIds: ['retry'], tools: [] }];
  const versions = reconcilePromptVersions(messages, ['a2', 'retry'], [], 1, runs);
  expect(versions[0].images[0].id).toBe('attachment-u2');
  expect(versions[1].images[0].id).toBe('attachment-u1');
});

it('restores by appending a detached copy and uses unique IDs even within one millisecond', () => {
  const originals = reconcilePromptVersions([user('u1', '图片7'), assistant('a1')], ['a1'], [], 1);
  const restored = restorePromptVersion(originals, 'version-a1', 50);
  expect(restored).toHaveLength(2);
  expect(restored[1]).toMatchObject({ restoredFrom: 'version-a1', promptText: prompt, createdAt: 50 });
  expect(new Set(restorePromptVersion(restored, 'version-a1', 50).map((version) => version.id)).size).toBe(3);
  restored[1].images[0].displayName = 'changed';
  expect(originals[0].images[0].displayName).toBe('图片7');
  expect(restorePromptVersion(originals, 'missing', 50)).toEqual(originals);
});

it('reads only valid persisted versions and returns detached snapshots', () => {
  const valid = reconcilePromptVersions([assistant('a')], ['a'], [], 1)[0];
  expect(readPromptVersions({ h3Versions: [null, {}, valid, { ...valid, images: [{ uri: 'file://lost' }] }] })).toEqual([valid]);
  expect(readPromptVersions(null)).toEqual([]);
  const copy = readPromptVersions({ h3Versions: [valid] });
  copy[0].parameters.seed = '9';
  expect(valid.parameters).toEqual({});
});

it('reports a real line diff, preserving common content and both versions for large inputs', () => {
  expect(diffPromptVersions('scene\nold\nsound', 'scene\nnew\nsound')).toEqual([{ kind: 'same', text: 'scene' }, { kind: 'removed', text: 'old' }, { kind: 'added', text: 'new' }, { kind: 'same', text: 'sound' }]);
  const before = Array.from({ length: 1500 }, (_, index) => `old${index}`).join('\n');
  const after = Array.from({ length: 1500 }, (_, index) => `new${index}`).join('\n');
  const diff = diffPromptVersions(before, after);
  expect(diff.filter((line) => line.kind !== 'added').map((line) => line.text).join('\n')).toBe(before);
  expect(diff.filter((line) => line.kind !== 'removed').map((line) => line.text).join('\n')).toBe(after);
});
