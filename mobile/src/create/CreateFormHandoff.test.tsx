import React, { StrictMode } from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput, Image } from 'react-native';
import { CreateForm, type CreateFormDraftDependencies } from './CreateForm';
import { materializePromptHandoff, type PromptHandoff } from '../handoff/promptHandoff';
import type { PromptDraft } from '../handoff/promptDraft';
import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';
import { WorkflowForm } from '../workflows/renderer/WorkflowForm';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { Directory, File, Paths } from 'expo-file-system';

jest.mock('../storage/databaseClient', () => ({ getDatabase: () => undefined }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({}), useAudioPlayerStatus: () => ({}) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=';
const hash = 'd'.repeat(64);
const databases: Array<ReturnType<typeof createInitializedRealSqliteTestDb>> = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });
const handoff: PromptHandoff = { prompt: 'Orbit a tower', images: [{ id: 'i1', displayName: 'Tower', filename: 'tower.png', uri: `asset://${hash}` }], parameters: { resolution: '480p横', durationSeconds: 8, seed: '123' }, source: { threadId: 'thread-1', messageId: 'message-1', versionId: 'version-2' } };
const draft: PromptDraft = { id: 'd1', prompt: handoff.prompt, attachmentIds: ['i1'], handoff, createdAt: 1 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function setup(value: PromptDraft = draft) {
  const db = createInitializedRealSqliteTestDb(); databases.push(db);
  new Directory(Paths.document, 'cas/sha256/dd').create({ intermediates: true, idempotent: true });
  new File(Paths.document, `cas/sha256/dd/${hash}`).write(png, { encoding: 'base64' });
  db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, 68, 'image/png', `cas/sha256/dd/${hash}`, 1, 1);
  const rows = new Map([[value.id, value]]);
  const consume = jest.fn(async (id: string) => { const item = rows.get(id) ?? null; if (item) rows.set(id, { ...item, status: 'applied' }); return item; });
  const discard = jest.fn(async (id: string) => { rows.delete(id); });
  const drafts: CreateFormDraftDependencies = { read: async (id) => rows.get(id) ?? null, consume, discard, materialize: value => materializePromptHandoff(value, db as never) };
  const definition = builtinWorkflowDefinitions[1];
  const active = { workflowId: definition.id, version: definition.version, definitionJson: JSON.stringify(definition), contentHash: 'hash', hashScheme: 'workflow-package/without-declared-hash+sorted-json@1', source: 'builtin', trust: 'builtin', installedAt: 1 } as const;
  const queue = jest.fn(async () => ({ id: 'task1' }));
  const submissionDependencies = { catalog: { bootstrap: async () => undefined, listActive: async () => [active], getActive: async () => active }, queue, readSettings: jest.fn() };
  return { rows, consume, discard, drafts, queue, submissionDependencies };
}
const text = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map((node) => node.props.children).flat(Infinity).join(' ');

describe('Create prompt handoff', () => {
  it('applies source, version, images and schema-valid parameters once without submitting under StrictMode', async () => {
    const context = setup();
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<StrictMode><CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} /></StrictMode>); });
    expect(tree.root.findByType(WorkflowForm).props.value).toMatchObject({ prompt: 'Orbit a tower', resolution: '480p横', duration: 8, seed: 123 });
    expect(tree.root.findByType(Image).props.source.uri).toMatch(/^file:/);
    expect(text(tree)).toContain('thread-1');
    expect(text(tree)).toContain('version-2');
    expect(context.rows.size).toBe(1);
    expect(context.consume).toHaveBeenCalledTimes(1);
    expect(context.queue).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it.each([
    { ...handoff, parameters: { durationSeconds: 16 } },
    { ...handoff, images: [{ ...handoff.images[0], uri: 'https://example.test/image.png' }] },
  ])('retains a failed handoff and leaves form content unchanged', async (invalid) => {
    const context = setup({ ...draft, handoff: invalid });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CreateForm initialPrompt="Keep me" draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('Keep me');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(text(tree)).toContain('交接未应用');
    expect(context.rows.size).toBe(1);
    expect(context.consume).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('does not overwrite manual edits made while image materialization is pending', async () => {
    const context = setup();
    const pending = deferred<Awaited<ReturnType<typeof materializePromptHandoff>>>();
    context.drafts.materialize = () => pending.promise;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '提交 AutoDL 任务生成' }).props.disabled).toBe(true);
    act(() => tree.root.findAllByType(TextInput).find((node) => node.props.multiline)!.props.onChangeText('My new edit'));
    await act(async () => { pending.resolve([{ uri: 'file:///tower.png' }]); });
    expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('My new edit');
    expect(context.consume).not.toHaveBeenCalled();
    expect(text(tree)).toContain('已修改');
    expect(tree.root.findByProps({ accessibilityLabel: '提交 AutoDL 任务生成' }).props.disabled).toBe(false);
    act(() => tree.unmount());
  });

  it('does not consume a draft whose files finish after unmount', async () => {
    const context = setup();
    const pending = deferred<Awaited<ReturnType<typeof materializePromptHandoff>>>();
    context.drafts.materialize = () => pending.promise;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    act(() => tree.unmount());
    await act(async () => { pending.resolve([{ uri: 'file:///tower.png' }]); });
    expect(context.rows.has('d1')).toBe(true);
    expect(context.consume).not.toHaveBeenCalled();
  });

  it('waits for registry readiness and preserves edits made during bootstrap', async () => {
    const context = setup();
    const pending = deferred<void>();
    context.submissionDependencies.catalog.bootstrap = async () => { await pending.promise; return undefined; };
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CreateForm initialPrompt="Initial" draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    expect(context.rows.has('d1')).toBe(true);
    await act(async () => { tree.update(<CreateForm initialPrompt="Updated outside" draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    await act(async () => { pending.resolve(); });
    expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('Updated outside');
    expect(context.consume).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('ignores completion after unmount or switching drafts', async () => {
    const context = setup();
    const pending = deferred<PromptDraft | null>();
    context.drafts.read = (id) => id === 'd1' ? pending.promise : Promise.resolve({ ...draft, id: 'd2', prompt: 'Second', handoff: { ...handoff, prompt: 'Second', images: [] } });
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    await act(async () => { tree.update(<CreateForm draftId="d2" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
    await act(async () => { pending.resolve(draft); });
    expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('Second');
    expect(context.consume).not.toHaveBeenCalledWith('d1');
    act(() => tree.unmount());
  });
});

it('finishes handoff loading when workflow loading fails and offers explicit retry/discard', async () => {
  const context = setup();
  context.submissionDependencies.catalog.bootstrap = async () => { throw new Error('registry offline'); };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
  expect(text(tree)).not.toContain('正在读取交接');
  expect(context.rows.has('d1')).toBe(true);
  act(() => tree.unmount());
});

it('reapplies a retained handoff after an edit conflict and can explicitly discard it', async () => {
  const context = setup();
  const pending = deferred<Awaited<ReturnType<typeof materializePromptHandoff>>>();
  context.drafts.materialize = () => pending.promise;
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
  act(() => tree.root.findAllByType(TextInput).find(node => node.props.multiline)!.props.onChangeText('edited'));
  await act(async () => pending.resolve([]));
  await act(async () => tree.root.findByProps({ accessibilityLabel: '重新应用交接草稿' }).props.onPress());
  expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('Orbit a tower');
  act(() => tree.unmount());
  const invalid = setup({ ...draft, handoff: { ...handoff, parameters: { durationSeconds: -1 } } });
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={invalid.drafts} submissionDependencies={invalid.submissionDependencies} />); });
  await act(async () => tree.root.findByProps({ accessibilityLabel: '丢弃交接草稿' }).props.onPress());
  expect(invalid.discard).toHaveBeenCalledWith('d1');
  act(() => tree.unmount());
});

it('reopens an applied handoff and carries its owner identity into task submission', async () => {
  const context = setup();
  context.submissionDependencies.readSettings.mockResolvedValue({ token: 'token' });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
  act(() => tree.unmount());
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
  expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('Orbit a tower');
  await act(async () => tree.root.findByProps({ accessibilityLabel: '提交 AutoDL 任务生成' }).props.onPress());
  expect(context.queue).toHaveBeenCalledWith(expect.objectContaining({ handoffId: 'd1' }));
  act(() => tree.unmount());
});

it('saves edits to an applied form and restores them after leaving and reopening', async () => {
  const context = setup();
  context.drafts.saveForm = async (id, form) => { context.rows.set(id, { ...context.rows.get(id)!, form }); };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
  await act(async () => tree.root.findAllByType(TextInput).find(node => node.props.multiline)!.props.onChangeText('Recovered edit'));
  act(() => tree.unmount());
  await act(async () => { tree = create(<CreateForm draftId="d1" draftDependencies={context.drafts} submissionDependencies={context.submissionDependencies} />); });
  expect(tree.root.findByType(WorkflowForm).props.value.prompt).toBe('Recovered edit');
  act(() => tree.unmount());
});
