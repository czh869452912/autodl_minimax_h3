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
