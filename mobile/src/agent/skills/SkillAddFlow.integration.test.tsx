import React from 'react';
import {act, create} from 'react-test-renderer';
import {Alert, TextInput} from 'react-native';
import {zipSync, strToU8} from 'fflate';
import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {ListAction} from '../../ui/ListPageUI';
import {IconAction} from '../../creative/WorkbenchUI';
import {KeyboardSurface} from '../../ui/KeyboardSurface';
import {SkillAddFlow} from './SkillAddFlow';
import {readNextRunSkills} from './nextRun';
import {validateSkillPackage} from './package';

let mockDb: ReturnType<typeof createInitializedRealSqliteTestDb>;
const mockPush = jest.fn(), mockPick = jest.fn();
let mockFile: {size: number; text: () => Promise<string>; bytes: () => Promise<Uint8Array>};
jest.mock('../../storage/databaseClient', () => ({getDatabase: () => mockDb}));
jest.mock('expo-router', () => ({useRouter: () => ({push: mockPush})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync: (...args: unknown[]) => mockPick(...args)}));
jest.mock('expo-file-system', () => ({File: jest.fn().mockImplementation(() => mockFile)}));
jest.mock('../../ui/icons', () => ({AppIcon: () => null}));
const pkgText = (name = 'm2-review') => `---\nname: ${name}\ndescription: Review scenes\n---\nReview the scene.`;
const onStatus = jest.fn(), onDone = jest.fn(), onReturn = jest.fn();
let tree: ReturnType<typeof create>;
beforeEach(() => {
  mockDb = createInitializedRealSqliteTestDb();
  mockDb.runSync("INSERT INTO creative_agent_scopes VALUES('thread',NULL,0,1)");
  mockPick.mockReset(); mockPush.mockClear(); onStatus.mockClear(); onDone.mockClear(); onReturn.mockClear();
  mockFile = {size: 20, text: async () => pkgText(), bytes: async () => new Uint8Array()};
});
afterEach(() => { if (tree) act(() => tree.unmount()); mockDb.close(); jest.restoreAllMocks(); });
const action = (label: string) => tree.root.findAllByType(ListAction).find(node => node.props.label === label)!;
const icon = (label: string) => tree.root.findAllByType(IconAction).find(node => node.props.label === label)!;
const text = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '技能文本')!;
async function click(label: string) { await act(async () => action(label).props.onPress()); }
async function mount(threadId?: string) { await act(async () => { tree = create(<SkillAddFlow threadId={threadId} onStatus={onStatus} onCancel={jest.fn()} onReturn={onReturn} onDone={onDone}/>); }); }
async function edit(content = pkgText()) {
  await click('手写或粘贴技能'); await click('直接编辑 SKILL.md');
  act(() => text().props.onChangeText(content));
}
const installedCount = () => mockDb.getFirstSync<{n: number}>('SELECT COUNT(*) AS n FROM agent_skill_versions')!.n;

test('source, editing and review stay separate; install is idempotent and does not enable defaults', async () => {
  await mount('thread');
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  await edit(); await click('检查技能');
  expect(installedCount()).toBe(0);
  expect(JSON.stringify(tree.toJSON())).toContain('检查并安装');
  await act(async () => { const install = action('安装此版本').props.onPress; install(); install(); });
  expect(installedCount()).toBe(1);
  expect(mockDb.getFirstSync<{n: number}>('SELECT COUNT(*) AS n FROM agent_skill_bindings')!.n).toBe(0);
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull();
  await click('只安装并返回原会话'); expect(onReturn).toHaveBeenCalledTimes(1);
  await click('查看已安装版本'); expect(onDone).toHaveBeenCalledWith(validateSkillPackage({'SKILL.md': pkgText()}).id);
});

test('invalid content stays editable; returning from review requires checking the edited version again', async () => {
  await mount(); await edit('invalid content'); await click('检查技能');
  expect(JSON.stringify(tree.toJSON())).toContain('需要 YAML'); expect(installedCount()).toBe(0);
  act(() => text().props.onChangeText(pkgText('first-version'))); await click('检查技能');
  act(() => icon('返回编辑').props.onPress());
  expect(tree.root.findAllByType(ListAction).some(node => node.props.label === '安装此版本')).toBe(false);
  act(() => text().props.onChangeText(pkgText('revised-version'))); await click('检查技能'); await click('安装此版本');
  expect(mockDb.getFirstSync<{name: string}>('SELECT name FROM agent_skill_versions')!.name).toBe('revised-version');
});

test('example replacement asks first; cancelling retains the complete draft', async () => {
  await mount(); await edit(); const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await click('填入技能示例');
  expect(text().props.value).toBe(pkgText());
  expect(alert).toHaveBeenLastCalledWith('替换当前草稿？', expect.any(String), expect.any(Array));
  act(() => alert.mock.calls.at(-1)![2]!.find(button => button.text === '替换草稿')!.onPress!());
  expect(text().props.value).toContain('name: scene-review');
});

test('cancelling the document picker preserves a draft across source and edit steps', async () => {
  mockPick.mockResolvedValue({canceled: true}); await mount(); await edit();
  act(() => icon('返回来源').props.onPress()); await click('选择技能文件'); await click('继续编辑草稿');
  expect(text().props.value).toBe(pkgText()); expect(installedCount()).toBe(0);
});

test('ZIP supporting files survive editing, full preview and installation', async () => {
  const content = pkgText() + '\n[Notes](notes.md)';
  mockFile.bytes = async () => zipSync({'SKILL.md': strToU8(content), 'notes.md': strToU8('Supporting reference')});
  mockPick.mockResolvedValue({canceled: false, assets: [{name: 'skill.zip', uri: 'file://qa.zip'}]});
  await mount(); await click('选择技能文件');
  expect(text().props.value).toBe(content);
  act(() => text().props.onChangeText(content + '\nEdited.')); await click('检查技能'); await click('查看文件 notes.md');
  expect(JSON.stringify(tree.toJSON())).toContain('Supporting reference');
  await click('安装此版本');
  const saved = JSON.parse(mockDb.getFirstSync<{files_json: string}>('SELECT files_json FROM agent_skill_versions')!.files_json);
  expect(saved['notes.md']).toBe('Supporting reference'); expect(saved['SKILL.md']).toContain('Edited.');
});

test('install failure retains the reviewed version and can retry without losing content', async () => {
  await mount(); await edit(); await click('检查技能');
  jest.spyOn(mockDb, 'runAsync').mockRejectedValueOnce(Error('disk unavailable'));
  await click('安装此版本'); expect(JSON.stringify(tree.toJSON())).toContain('disk unavailable');
  expect(JSON.stringify(tree.toJSON())).toContain('Review the scene.'); expect(installedCount()).toBe(0);
  await click('安装此版本'); expect(installedCount()).toBe(1);
});

test('choosing next message writes only the explicit override and preserves defaults', async () => {
  await mount('thread'); await edit(); await click('检查技能'); await click('安装此版本'); await click('用于下次消息');
  expect(await readNextRunSkills(mockDb as never, 'thread')).toEqual({ids: [validateSkillPackage({'SKILL.md': pkgText()}).id], valid: true});
  expect(mockDb.getFirstSync<{n: number}>('SELECT COUNT(*) AS n FROM agent_skill_bindings')!.n).toBe(0);
  await click('返回原会话'); expect(onReturn).toHaveBeenCalledTimes(1);
});

test('scope drift blocks next-message selection while keeping the installed version', async () => {
  await mount('thread'); await edit(); await click('检查技能'); await click('安装此版本');
  mockDb.runSync("UPDATE creative_agent_scopes SET revision=1 WHERE thread_id='thread'");
  await click('用于下次消息'); expect(JSON.stringify(tree.toJSON())).toContain('会话范围已变化');
  expect(await readNextRunSkills(mockDb as never, 'thread')).toBeNull(); expect(installedCount()).toBe(1);
});

test('purpose fields create a local draft before review and never silently reuse an older body', async () => {
  await mount(); await click('手写或粘贴技能');
  const purpose = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '技能用途')!;
  act(() => purpose().props.onChangeText('Review composition'));
  expect(tree.root.findAllByType(ListAction).some(node => node.props.label === '检查技能')).toBe(false);
  await click('创建草稿'); expect(text().props.value).toContain('Review composition');
  await click('按用途重建草稿'); act(() => purpose().props.onChangeText('New purpose'));
  expect(tree.root.findAllByType(ListAction).some(node => node.props.label === '检查技能')).toBe(false);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await click('创建草稿');
  act(() => alert.mock.calls.at(-1)![2]!.find(button => button.text === '替换草稿')!.onPress!());
  expect(text().props.value).toContain('New purpose'); expect(installedCount()).toBe(0);
});

test('only the focused editor owns keyboard avoidance; source and review cannot retain a keyboard gap', async () => {
  await mount(); expect(tree.root.findByType(KeyboardSurface).props.enabled).toBe(false);
  await edit(); act(() => text().props.onFocus());
  expect(tree.root.findByType(KeyboardSurface).props.enabled).toBe(true);
  await click('检查技能'); expect(tree.root.findByType(KeyboardSurface).props.enabled).toBe(false);
  act(() => icon('返回编辑').props.onPress());
  expect(tree.root.findByType(KeyboardSurface).props.enabled).toBe(false);
});
