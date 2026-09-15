import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, Text } from 'react-native';
import { DownloadNetworkHelp } from './DownloadNetworkHelp';
import { ARTIFACT_NETWORK_HELP_CODES, artifactNetworkMessage } from '../workflows/executor/artifactErrors';

test.each(ARTIFACT_NETWORK_HELP_CODES)('offers help for persisted code and formatted %s', code => {
  for (const error of [code, artifactNetworkMessage(code) ?? code]) {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<DownloadNetworkHelp error={error} />); });
    expect(tree.root.findAllByProps({ accessibilityRole: 'button' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  }
});

test('offers actionable help without displaying the failed signed URL', () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<DownloadNetworkHelp error="ARTIFACT_VIRTUAL_DNS https://secret.test/?token=secret" />); });
  const buttons = tree.root.findAllByProps({ accessibilityRole: 'button' });
  act(() => buttons[0].props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  const text = tree.root.findAllByType(Text).map(node => node.props.children).join(' ');
  expect(text).toContain('DIRECT');
  expect(text).toContain('动态 CDN');
  expect(text).toContain('重试下载');
  expect(text).not.toContain('secret');
  act(() => tree.unmount());
});
