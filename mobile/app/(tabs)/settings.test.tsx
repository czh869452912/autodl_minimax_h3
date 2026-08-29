import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('../../src/settings/storage', () => ({
  readSettings: jest.fn(async () => ({
    token: '',
    llmEndpoint: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o-mini',
    llmApiKey: '',
    llmTimeoutSeconds: '600',
    llmMaxRetries: '2',
  })),
  saveSettings: jest.fn(async () => undefined),
}));
jest.mock('../../src/ui/icons', () => ({ AppIcon: () => null }));

import SettingsScreen from './settings';

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
});
