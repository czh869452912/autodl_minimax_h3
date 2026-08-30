import React from 'react';
import { act, create } from 'react-test-renderer';
import { Linking, Text } from 'react-native';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('../settings/storage', () => ({
  readSettings: jest.fn(async () => ({
    token: '',
    llmEndpoint: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o-mini',
    llmApiKey: '',
    llmTimeoutSeconds: '600',
    llmMaxRetries: '2',
    autoExportToGallery: true,
    keepPrivateCopy: true,
  })),
  saveSettings: jest.fn(async () => undefined),
}));
jest.mock('../tasks/sync', () => ({ taskStore: { list: jest.fn(async () => [{ id: 'task-1', localUri: 'file:///old.mp4', exportState: 'NOT_REQUESTED' }]), upsert: jest.fn(async () => undefined) } }));
jest.mock('../tasks/media', () => ({ migrateDownloadedVideos: jest.fn(async () => ({ exported: 1, failed: 0 })) }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import SettingsScreen from '../../app/(tabs)/settings';
import { migrateDownloadedVideos } from '../tasks/media';

describe('Prompt assistant advanced LLM settings', () => {
  it('keeps advanced network controls collapsed and reveals editable defaults on demand', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SettingsScreen />);
    });

    expect(renderer!.root.findAllByProps({ placeholder: '600' })).toHaveLength(0);
    const toggle = renderer!.root.findByProps({ accessibilityLabel: '切换 LLM 高级设置' });
    await act(async () => toggle.props.onPress());

    expect(renderer!.root.findByProps({ placeholder: '600' })).toBeTruthy();
    expect(renderer!.root.findByProps({ placeholder: '2' })).toBeTruthy();
  });

  it('shows enabled gallery export defaults and the fixed destination', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SettingsScreen />); });
    expect(renderer!.root.findByProps({ accessibilityLabel: '自动保存到系统相册' }).props.value).toBe(true);
    expect(renderer!.root.findByProps({ accessibilityLabel: '保留应用内副本' }).props.value).toBe(true);
    const text = renderer!.root.findAllByType(Text).map((node) => [node.props.children].flat(Infinity).join(''));
    expect(text).toContain('保存位置：系统相册 / Movies / AutoDL-H3');
  });

  it('offers user-triggered migration instead of silently exporting history', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SettingsScreen />); });
    await act(async () => renderer!.root.findByProps({ accessibilityLabel: '将已有下载保存到相册' }).props.onPress());
    expect(migrateDownloadedVideos).toHaveBeenCalled();
  });

  it('offers a direct link to the AutoDL access token page', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SettingsScreen />); });

    const link = renderer!.root.findByProps({ accessibilityLabel: '打开 AutoDL Token 获取页面' });
    expect(link).toBeTruthy();
    await act(async () => link.props.onPress());

    expect(openURL).toHaveBeenCalledWith('https://autodl.art/large-model/tokens');
    openURL.mockRestore();
  });
});
