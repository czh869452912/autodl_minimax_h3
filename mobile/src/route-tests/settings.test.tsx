import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Linking, Text } from 'react-native';

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
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { readSettings, saveSettings } from '../settings/storage';
import SettingsScreen from '../../app/(tabs)/settings';

it('resets none when switching to an OpenAI model that cannot disable reasoning', async () => {
  jest.mocked(readSettings).mockResolvedValueOnce({ token: '', llmEndpoint: 'https://api.openai.com/v1', llmModel: 'gpt-5.1', llmApiKey: 'key', llmReasoningEffort: 'none', llmTimeoutSeconds: '600', llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<SettingsScreen />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '切换 LLM 高级设置' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: '思考强度：关闭（none）' }).props.accessibilityState.checked).toBe(true);
    act(() => tree.root.findByProps({ accessibilityLabel: 'LLM 模型' }).props.onChangeText('gpt-5'));
    expect(tree.root.findAllByProps({ accessibilityLabel: '思考强度：关闭（none）' })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: '思考强度：服务商默认' }).props.accessibilityState.checked).toBe(true);
    expect(tree.root.findByProps({ accessibilityLabel: '思考强度：极低（minimal）' })).toBeTruthy();
  } finally { act(() => tree?.unmount()); }
});

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

it('edits and saves DeepSeek effort and output budget, and restores advanced defaults only', async () => {
  jest.mocked(readSettings).mockResolvedValueOnce({ token: 'keep-token', llmEndpoint: 'https://api.deepseek.com', llmModel: 'deepseek-v4-flash', llmApiKey: 'keep-key', llmTimeoutSeconds: '600', llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<SettingsScreen />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '切换 LLM 高级设置' }).props.onPress());
    const input = () => tree.root.findByProps({ accessibilityLabel: '最大输出（tokens）' });
    expect(input().props.value).toBe('4096');
    expect(tree.root.findAllByProps({ accessibilityLabel: '思考强度：中（medium）' })).toHaveLength(0);
    act(() => input().props.onChangeText('8192'));
    act(() => tree.root.findByProps({ accessibilityLabel: '思考强度：最高（max）' }).props.onPress());
    await act(async () => tree.root.findByProps({ accessibilityLabel: '保存设置' }).props.onPress());
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ llmMaxOutputTokens: '8192', llmReasoningEffort: 'max' }));
    act(() => tree.root.findByProps({ accessibilityLabel: '恢复 LLM 高级设置默认值' }).props.onPress());
    expect(input().props.value).toBe('4096');
    await act(async () => tree.root.findByProps({ accessibilityLabel: '保存设置' }).props.onPress());
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'keep-token', llmApiKey: 'keep-key', llmModel: 'deepseek-v4-flash', llmReasoningEffort: 'default', llmMaxOutputTokens: '4096' }));
  } finally { act(() => tree?.unmount()); alert.mockRestore(); }
});
