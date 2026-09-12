import { diffPromptVersions, readPromptVersions, reconcilePromptVersions, restorePromptVersion } from './promptVersions';

const prompt = 'integrated_multimodal_description: @图片7 runs.\noverall_soundscape: Wind.\nnon_diegetic_music: None.';
const assistant = (id?: string) => ({ id, role: 'assistant', content: `\`\`\`h3-prompt\n${prompt}\n\`\`\`` });
const user = (id: string, label: string) => ({ id, role: 'user', content: [{ type: 'image_url', image_url: { url: `file://${id}` }, metadata: { attachmentId: `attachment-${id}`, displayName: label, filename: `${id}.png` } }] });

it('creates each completed artifact once and retains its immutable image identity after later turns', () => {
  const messages = [user('u1', '图片7'), assistant('a1')];
  const versions = reconcilePromptVersions(messages, ['a1'], [], 100);
  expect(versions).toMatchObject([{ artifactId: 'artifact-a1-0-1', sourceMessageId: 'a1', promptText: prompt, createdAt: 100, images: [{ id: 'attachment-u1', displayName: '图片7', filename: 'u1.png', uri: 'file://u1' }], parameters: {} }]);
  const next = reconcilePromptVersions([...messages, user('u2', '图片9'), assistant('a2')], ['a1', 'a2'], versions, 200);
  expect(next).toHaveLength(2);
  expect(next[0]).toEqual(versions[0]);
  expect(next[1].images.map((image) => image.id)).toEqual(['attachment-u1', 'attachment-u2']);
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

it('keeps the conversation image context for a text-only refinement', () => {
  const messages = [user('old', '图片1'), user('new', '图片7'), { id: 'refine', role: 'user', content: 'Faster.' }, assistant('a')];
  expect(reconcilePromptVersions(messages, ['a'], [], 1)[0].images.map((image) => image.id)).toEqual(['attachment-old', 'attachment-new']);
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
  const restored = restorePromptVersion(originals, originals[0].id, 50);
  expect(restored).toHaveLength(2);
  expect(restored[1]).toMatchObject({ restoredFrom: originals[0].id, promptText: prompt, createdAt: 50 });
  expect(new Set(restorePromptVersion(restored, originals[0].id, 50).map((version) => version.id)).size).toBe(3);
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

it('versions every artifact by source revision and candidate identity, including identical text', () => {
  const message = { ...assistant('a'), revision: 3, content: `${assistant('a').content}\nSecond\n${assistant('a').content}` };
  const versions = reconcilePromptVersions([user('u', '图片7'), message], ['a'], [], 1);
  expect(versions).toHaveLength(2);
  expect(new Set(versions.map(version => version.artifactId)).size).toBe(2);
  expect(versions.map(version => version.sourceRevision)).toEqual([3, 3]);
  expect(reconcilePromptVersions([message], ['a'], versions, 2)).toEqual(versions);
});

it('replays restore commands idempotently while allowing a later explicit restore', () => {
  const versions = reconcilePromptVersions([assistant('a')], ['a'], [], 1);
  const restored = restorePromptVersion(versions, versions[0].id, 10, 'restore-1');
  expect(restorePromptVersion(restored, versions[0].id, 20, 'restore-1')).toEqual(restored);
  expect(restorePromptVersion(restored, versions[0].id, 20, 'restore-2')).toHaveLength(3);
  expect(restored[1]).toMatchObject({ restoredFrom: versions[0].id, restoreCommandId: 'restore-1', artifactId: versions[0].artifactId });
});

it('does not infer image identity or numbering from legacy attachment position', () => {
  const messages = [{ id: 'u', role: 'user', content: [{ type: 'image_url', image_url: { url: 'file://unknown' } }] }, assistant('a')];
  const version = reconcilePromptVersions(messages, ['a'], [], 1)[0];
  expect(version.images[0]).toMatchObject({ identityKnown: false });
  expect(version.images[0].ordinal).toBeUndefined();
  expect(version.images[0].displayName).not.toBe('图片1');
});

it('rejects malformed persisted artifact provenance and binding fields', () => {
  const version = reconcilePromptVersions([assistant('a')], ['a'], [], 1)[0];
  for (const invalid of [
    { artifactId: 5 }, { sourceRevision: -1 }, { sourceRange: { start: 10, end: 1 } }, { restoreCommandId: '' },
    { images: [{ id: 'i', displayName: 'Picture 1', uri: 'file://i', ordinal: 1.5 }] },
  ]) expect(readPromptVersions({ h3Versions: [{ ...version, ...invalid }] })).toEqual([]);
});
