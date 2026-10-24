import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeAssetPicker } from './CreativeAssetPicker';
const mockVerify = jest.fn();
const mockVersion = { id: 'version', assetId: 'asset', versionNo: 2, state: 'AVAILABLE', mime: 'image/png', relativePath: 'a.png', recipe: {} };
jest.mock('./runtime', () => ({ creativeService: () => ({ assets: async () => [{ id: 'asset', kind: 'image', title: 'Forest' }], versions: async () => [mockVersion] }), creativeFiles: () => ({ verify: (...args: unknown[]) => mockVerify(...args) }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
const button = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
beforeEach(() => jest.clearAllMocks());

test('selecting a thumbnail does not attach it until confirmation and duplicate confirmations are locked', async () => {
  let release!: () => void;
  mockVerify.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const choose = jest.fn(async () => undefined), close = jest.fn();
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeAssetPicker kind="image" onChoose={choose} onClose={close} />); });
    expect(button(tree, '使用所选图片').props.accessibilityState.disabled).toBe(true);
    act(() => button(tree, '选择 Forest · 版本 2').props.onPress());
    expect(choose).not.toHaveBeenCalled();
    const confirm = button(tree, '使用所选图片').props.onPress;
    act(() => { confirm(); confirm(); });
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await act(async () => release());
    expect(choose).toHaveBeenCalledWith(mockVersion);
    expect(close).toHaveBeenCalledTimes(1);
  } finally { act(() => tree?.unmount()); }
});

test('failed attachment keeps the picker open and preserves the selection for recovery', async () => {
  mockVerify.mockRejectedValueOnce(new Error('原文件待恢复'));
  const choose = jest.fn(async () => undefined), close = jest.fn();
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeAssetPicker kind="image" onChoose={choose} onClose={close} />); });
    act(() => button(tree, '选择 Forest · 版本 2').props.onPress());
    await act(async () => button(tree, '使用所选图片').props.onPress());
    expect(close).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
    expect(button(tree, '选择 Forest · 版本 2').props.accessibilityState.selected).toBe(true);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'alert' && n.props.children === '原文件待恢复').length).toBeGreaterThan(0);
  } finally { act(() => tree?.unmount()); }
});
