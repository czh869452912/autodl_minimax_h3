import React from 'react';
import { Alert, Pressable, Share, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { DatabaseRecoveryScreen } from './DatabaseRecoveryScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));

const text = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');

test('shows and shares only the redacted diagnostic', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DatabaseRecoveryScreen diagnostic="MIGRATION_5_TO_6_FAILED" allowReset onReset={jest.fn()} />); });
  expect(text(tree)).toContain('数据升级未完成');
  expect(text(tree)).toContain('MIGRATION_5_TO_6_FAILED');
  const copyButton = tree.root.findAll((node) => node.props.accessibilityLabel === '复制诊断')[0];
  await act(async () => { await copyButton.props.onPress(); });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('MIGRATION_5_TO_6_FAILED');
  const button = tree.root.findAll((node) => node.props.accessibilityLabel === '分享诊断')[0];
  await act(async () => { await button.props.onPress(); });
  expect(share).toHaveBeenCalledWith({ message: 'AutoDL-H3 database recovery: MIGRATION_5_TO_6_FAILED' });
  act(() => tree.unmount());
});

test('future schema does not offer destructive reset', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DatabaseRecoveryScreen diagnostic="SCHEMA_VERSION_NEWER_THAN_APP" allowReset={false} onReset={jest.fn()} />); });
  expect(text(tree)).not.toContain('清除应用数据');
  act(() => tree.unmount());
});

test('requires confirmation before reset', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const onReset = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DatabaseRecoveryScreen diagnostic="MIGRATION_5_TO_6_FAILED" allowReset onReset={onReset} />); });
  const button = tree.root.findAll((node) => node.props.accessibilityLabel === '清除应用数据')[0];
  act(() => button.props.onPress());
  const actions = alert.mock.calls.at(-1)?.[2]!;
  act(() => actions[1].onPress?.());
  expect(onReset).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('requires confirmation before restoring the newest full backup', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const onRestore = jest.fn(async () => undefined);
  const backup = 'autodl-h3-v6-to-v7-200.backup.db';
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<DatabaseRecoveryScreen
      diagnostic="MIGRATION_6_TO_7_FAILED"
      allowReset
      onReset={jest.fn()}
      backupNames={[backup]}
      onRestore={onRestore}
    />);
  });
  const button = tree.root.findAll((node) => node.props.accessibilityLabel === '恢复选中的完整备份')[0];
  act(() => button.props.onPress());
  const actions = alert.mock.calls.at(-1)?.[2]!;
  await act(async () => { await actions[1].onPress?.(); });
  expect(onRestore).toHaveBeenCalledWith(backup);
  act(() => tree.unmount());
});

test('keeps recovery mode visible and localizes restore failures', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<DatabaseRecoveryScreen
      diagnostic="MIGRATION_6_TO_7_FAILED"
      allowReset
      onReset={jest.fn()}
      backupNames={['autodl-h3-v6-to-v7-200.backup.db']}
      onRestore={jest.fn(async () => { throw new Error('private path'); })}
    />);
  });
  act(() => tree.root.findAll((node) => node.props.accessibilityLabel === '恢复选中的完整备份')[0].props.onPress());
  const actions = alert.mock.calls.at(-1)?.[2]!;
  await act(async () => { await actions[1].onPress?.(); });
  expect(text(tree)).toContain('完整备份恢复失败');
  expect(text(tree)).not.toContain('private path');
  act(() => tree.unmount());
});


test('blocks reset and exit while restore is unresolved', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DatabaseRecoveryScreen diagnostic="failed" allowReset onReset={jest.fn()} backupNames={['backup']} onRestore={() => pending} />); });
  act(() => tree.root.findByProps({ accessibilityLabel: '恢复选中的完整备份' }).props.onPress());
  expect(alert.mock.calls.at(-1)?.[1]).toContain('请重新打开应用');
  act(() => { void alert.mock.calls.at(-1)?.[2]?.[1].onPress?.(); });
  expect(tree.root.findByProps({ accessibilityLabel: '清除应用数据' }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ accessibilityLabel: '退出应用' }).props.disabled).toBe(true);
  await act(async () => release());
  expect(tree.root.findByProps({ accessibilityLabel: '退出应用' }).props.disabled).toBe(false);
  act(() => tree.unmount());
  alert.mockRestore();
});
