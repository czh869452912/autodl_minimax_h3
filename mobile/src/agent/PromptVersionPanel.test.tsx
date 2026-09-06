import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { PromptVersionPanel } from './PromptVersionPanel';
import type { PromptVersion } from './promptVersions';
import type { PromptHandoff } from './promptHandoff';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
const versions: PromptVersion[] = [
  { id: 'v1', sourceMessageId: 'm1', promptText: 'scene\nold\nsound', createdAt: 1, images: [], parameters: {} },
  { id: 'v2', sourceMessageId: 'm2', promptText: 'scene\nnew\nsound', createdAt: 2, images: [{ id: 'img7', displayName: '图片1', uri: 'file://7', filename: 'cat.png' }, { id: 'img9', displayName: '图片2', uri: 'file://9' }], parameters: {} },
];
const text = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join('')).join('\n');
const press = (tree: ReturnType<typeof create>, label: string) => tree.root.findByProps({ accessibilityLabel: label }).props.onPress();

it('selects a compact old version, shows real changes, restores, and copies only the selected prompt', async () => {
  const onSelect = jest.fn(); const onRestore = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel versions={versions} threadId="t" onSelect={onSelect} onRestore={onRestore} onExport={async () => undefined} />); });
  expect(text(tree)).toContain('最新');
  act(() => press(tree, '比较上一版本'));
  expect(text(tree)).toContain('− old'); expect(text(tree)).toContain('+ new');
  act(() => press(tree, '选择版本 1'));
  expect(onSelect).toHaveBeenCalledWith('v1');
  act(() => { tree.update(<PromptVersionPanel versions={versions} selectedVersionId="v1" threadId="t" onSelect={onSelect} onRestore={onRestore} onExport={async () => undefined} />); });
  act(() => press(tree, '恢复此版本'));
  expect(onRestore).toHaveBeenCalledWith('v1');
  await act(async () => press(tree, '复制版本 Prompt'));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(versions[0].promptText);
  act(() => tree.unmount());
});

it('previews all images and exports only explicitly selected images and parameters with provenance', async () => {
  const onExport = jest.fn(async () => undefined);
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel versions={versions} threadId="thread1" onSelect={() => undefined} onRestore={() => undefined} onExport={onExport} />); });
  act(() => press(tree, '预览并带入创建页'));
  expect(onExport).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ accessibilityLabel: '绑定图片 图片1' }).props.accessibilityState.checked).toBe(true);
  act(() => {
    press(tree, '绑定图片 图片2');
    tree.root.findByProps({ accessibilityLabel: '分辨率（可选）' }).props.onChangeText('480p横');
    tree.root.findByProps({ accessibilityLabel: '时长秒数（可选）' }).props.onChangeText('6');
    tree.root.findByProps({ accessibilityLabel: 'Seed（可选）' }).props.onChangeText('123');
  });
  await act(async () => press(tree, '带入创建页'));
  expect(onExport).toHaveBeenCalledWith({ prompt: versions[1].promptText, images: [versions[1].images[0]], parameters: { resolution: '480p横', durationSeconds: 6, seed: '123' }, source: { threadId: 'thread1', messageId: 'm2', versionId: 'v2' } });
  expect(versions[1].images).toHaveLength(2); expect(versions[1].parameters).toEqual({});
  act(() => tree.unmount());
});

it('blocks known missing image references and invalid durations, including programmatic presses', async () => {
  const onExport = jest.fn(async () => undefined);
  const version = { ...versions[1], promptText: '@图片1 and <Picture 2>' };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel versions={[version]} threadId="t" onSelect={() => undefined} onRestore={() => undefined} onExport={onExport} />); });
  act(() => press(tree, '预览并带入创建页'));
  act(() => press(tree, '绑定图片 图片1'));
  expect(text(tree)).toContain('图片1');
  expect(tree.root.findByProps({ accessibilityLabel: '带入创建页' }).props.disabled).toBe(true);
  await act(async () => press(tree, '带入创建页'));
  expect(onExport).not.toHaveBeenCalled();
  act(() => { press(tree, '绑定图片 图片1'); tree.root.findByProps({ accessibilityLabel: '时长秒数（可选）' }).props.onChangeText('-1'); });
  expect(tree.root.findByProps({ accessibilityLabel: '带入创建页' }).props.disabled).toBe(true);
  act(() => tree.unmount());
});

it('keeps the preview and failure visible for retry and omits blank workflow defaults', async () => {
  const onExport = jest.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel versions={versions} threadId="t" onSelect={() => undefined} onRestore={() => undefined} onExport={onExport} />); });
  act(() => press(tree, '预览并带入创建页'));
  await act(async () => press(tree, '带入创建页'));
  expect(text(tree)).toContain('Disk unavailable');
  await act(async () => press(tree, '带入创建页'));
  expect(onExport.mock.calls[1][0].parameters).toEqual({});
  expect(tree.root.findAllByProps({ accessibilityLabel: '带入创建页' })).toHaveLength(0);
  act(() => tree.unmount());
});

it('prevents duplicate exports while pending and closes stale previews on task change', async () => {
  let resolve!: () => void;
  const onExport = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
  const props = { versions, onSelect: () => undefined, onRestore: () => undefined, onExport };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel {...props} threadId="t1" />); });
  act(() => press(tree, '预览并带入创建页'));
  act(() => { press(tree, '带入创建页'); press(tree, '带入创建页'); });
  expect(onExport).toHaveBeenCalledTimes(1);
  act(() => tree.update(<PromptVersionPanel {...props} threadId="t2" />));
  expect(tree.root.findAllByProps({ accessibilityLabel: '带入创建页' })).toHaveLength(0);
  await act(async () => resolve());
  act(() => tree.unmount());
});

it('refuses gaps in numeric bindings and exports reordered candidates by image number', async () => {
  const onExport = jest.fn(async (_handoff: PromptHandoff) => undefined);
  const reversed = { ...versions[1], images: [...versions[1].images].reverse() };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel versions={[reversed]} threadId="t" onSelect={() => undefined} onRestore={() => undefined} onExport={onExport} />); });
  act(() => press(tree, '预览并带入创建页'));
  act(() => press(tree, '绑定图片 图片1'));
  expect(tree.root.findByProps({ accessibilityLabel: '带入创建页' }).props.disabled).toBe(true);
  await act(async () => press(tree, '带入创建页'));
  expect(onExport).not.toHaveBeenCalled();
  act(() => press(tree, '绑定图片 图片1'));
  await act(async () => press(tree, '带入创建页'));
  expect(onExport.mock.calls[0][0].images.map((image) => image.displayName)).toEqual(['图片1', '图片2']);
  act(() => tree.unmount());
});

it.each([['分辨率（可选）', '720p'], ['时长秒数（可选）', '16'], ['时长秒数（可选）', '1.5'], ['Seed（可选）', '0'], ['Seed（可选）', '1e3']])('refuses invalid %s before saving a handoff', async (label, value) => {
  const onExport = jest.fn(async () => undefined);
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<PromptVersionPanel versions={versions} threadId="t" onSelect={() => undefined} onRestore={() => undefined} onExport={onExport} />); });
  act(() => press(tree, '预览并带入创建页'));
  act(() => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value));
  await act(async () => press(tree, '带入创建页'));
  expect(onExport).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
