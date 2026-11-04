import React from 'react';
import {act, create} from 'react-test-renderer';
import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {createLocalThreadStore} from '../threadStore';
import {createSkillStore} from './store';
import {validateSkillPackage} from './package';
import {readNextRunSkills, selectNextRunSkills} from './nextRun';
import {SkillQuickPicker} from './SkillQuickPicker';
import {ListAction} from '../../ui/ListPageUI';
import {DraggableBottomSheet} from '../../ui/DraggableSheet';

let mockDb: ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockPush = jest.fn();
let mockFocus: (() => void | (() => void)) | undefined;
jest.mock('../../storage/databaseClient', () => ({getDatabase: () => mockDb}));
jest.mock('expo-router', () => ({useRouter: () => ({push: mockPush}), useFocusEffect: (effect: () => void) => { mockFocus = effect; require('react').useEffect(effect, [effect]); }}));
jest.mock('../../ui/icons', () => ({AppIcon: () => null}));
jest.mock('../../ui/DraggableSheet', () => ({
  SheetScrollView: require('react-native').ScrollView,
  DraggableBottomSheet: ({visible, children, footer}: any) => visible ? <>{children}{footer}</> : null,
}));
let tree: ReturnType<typeof create>;
let id: string;
const onReturn = jest.fn();
beforeEach(async () => {
  mockDb = createInitializedRealSqliteTestDb();
  mockDb.runSync("INSERT INTO creative_agent_scopes VALUES('thread',NULL,0,1)");
  id = await createSkillStore(mockDb as never).install(validateSkillPackage({'SKILL.md': '---\nname: scene-review\ndescription: Review scenes\n---\nReview.'}));
  mockPush.mockClear(); onReturn.mockClear();
});
afterEach(() => { if (tree) act(() => tree.unmount()); mockDb.close(); });
const action = (label: string) => tree.root.findAllByType(ListAction).find(n => n.props.label === label)!;
const control = (label: string) => tree.root.findByProps({accessibilityLabel: label});
async function mount(running = false) { await act(async () => { tree = create(<SkillQuickPicker threadId="thread" running={running} onReturn={onReturn}/>); }); }
async function open() { await act(async () => control('技能 · 项目默认').props.onPress()); }
async function choose() { await act(async () => control(`本次选用 scene-review ${id.slice(0, 8)}`).props.onPress()); }

test('cancel never persists a draft or changes defaults', async () => {
  await mount(); await open(); await choose();
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  act(() => tree.root.findByType(DraggableBottomSheet).props.onClose());
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  expect((await createSkillStore(mockDb as never).list())[0].enabled).toBe(false);
});

test('confirm persists once, acceptance consumes it and next run inherits defaults', async () => {
  await mount(); await open(); await choose();
  await act(async () => action('用于下次消息').props.onPress());
  expect(await readNextRunSkills(mockDb as never, 'thread')).toEqual({ids: [id], valid: true});
  const threads = createLocalThreadStore(mockDb as never);
  const empty = {threadId: 'thread', messages: [], state: {}, createdAt: 1, updatedAt: 1};
  const accept = async (runId: string) => threads.accept(await threads.load('thread') ?? empty, {id: 'submit-' + runId, runId, draftRevision: 0, message: {id: 'user-' + runId, role: 'user', content: 'Review'}});
  await act(async () => { await accept('first'); });
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  expect(control('技能 · 项目默认')).toBeDefined();
  expect((await createSkillStore(mockDb as never).capture('thread', 'first')).versions.map(v => v.id)).toEqual([id]);
  await act(async () => { await accept('second'); });
  expect((await createSkillStore(mockDb as never).capture('thread', 'second')).versions).toEqual([]);
});

test('builtin-only is distinct from clearing the override to inherit defaults', async () => {
  await createSkillStore(mockDb as never).enable(id);
  await mount(); await open();
  act(() => control('仅使用内置技能').props.onPress());
  await act(async () => action('用于下次消息').props.onPress());
  expect(await readNextRunSkills(mockDb as never, 'thread')).toEqual({ids: [], valid: true});
  act(() => control('下次：仅内置技能').props.onPress());
  act(() => control('使用项目默认技能').props.onPress());
  await act(async () => action('用于下次消息').props.onPress());
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  expect((await createSkillStore(mockDb as never).list())[0].enabled).toBe(true);
});

test('management navigation preserves the unconfirmed draft without writing it', async () => {
  await mount(); await open(); await choose();
  act(() => action('管理技能与项目默认').props.onPress());
  expect(mockPush).toHaveBeenCalledWith({pathname: '/agent-skills', params: {projectId: undefined, returnThreadId: 'thread'}});
  expect(tree.root.findByType(DraggableBottomSheet).props.visible).toBe(false);
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  await act(async () => { mockFocus?.(); });
  expect(tree.root.findByType(DraggableBottomSheet).props.visible).toBe(true);
  expect(control(`本次选用 scene-review ${id.slice(0, 8)}`).props.accessibilityState.checked).toBe(true);
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  await act(async () => action('用于下次消息').props.onPress());
  expect(await readNextRunSkills(mockDb as never, 'thread')).toEqual({ids: [id], valid: true});
});

test('scope drift rejects confirmation and keeps the picker open', async () => {
  await mount(); await open(); await choose();
  mockDb.runSync("UPDATE creative_agent_scopes SET revision=1 WHERE thread_id='thread'");
  await act(async () => action('用于下次消息').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('会话范围已变化');
  expect(tree.root.findByType(DraggableBottomSheet).props.visible).toBe(true);
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
});

test('an explicit next-message choice from installation replaces the old local draft on return', async () => {
  await mount(); await open();
  // This unconfirmed choice differs from what the installation task commits.
  act(() => control('仅使用内置技能').props.onPress());
  act(() => action('管理技能与项目默认').props.onPress());
  await act(async () => { await selectNextRunSkills(mockDb as never, 'thread', [id]); });
  await act(async () => { mockFocus?.(); });
  expect(control(`本次选用 scene-review ${id.slice(0, 8)}`).props.accessibilityState.checked).toBe(true);
  expect(control('仅使用内置技能').props.accessibilityState.checked).toBe(false);
});

test('a revoked pending version is labelled invalid; running locks the selector', async () => {
  await selectNextRunSkills(mockDb as never, 'thread', [id]);
  await createSkillStore(mockDb as never).revoke(id);
  await mount(true);
  expect(control('下次技能已失效，请重新选择').props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('完成后可更改下次技能');
});
