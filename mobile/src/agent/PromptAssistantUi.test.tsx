import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { Text } from 'react-native';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@copilotkit/react-native', () => ({ useCopilotChatContext: () => ({}) }));
jest.mock('@copilotkit/react-native/components', () => ({ CopilotMarkdown: ({ content }: { content: string }) => <>{content}</> }));
jest.mock('@copilotkit/shared', () => ({ getSourceUrl: (source: { value?: string }) => source.value || '' }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));

import { PromptResultCard, ToolTimeline, Composer, ConversationTimeline } from './PromptAssistantUi';

describe('Prompt assistant UI primitives', () => {
  it('keeps tool details collapsed until expanded', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ToolTimeline steps={[{ id: 't1', name: 'skill', status: 'complete' }]} />); });
    expect(tree.root.findAllByType(Text).some((node) => Array.isArray(node.props.children) && node.props.children.includes('skill'))).toBe(false);
    act(() => tree.root.findByProps({ accessibilityLabel: '展开处理过程' }).props.onPress());
    expect(tree.root.findAllByType(Text).some((node) => Array.isArray(node.props.children) && node.props.children.includes('skill'))).toBe(true);
    act(() => tree.unmount());
  });

  it('copies only prompt text and exports the same prompt', async () => {
    jest.useFakeTimers();
    const onExport = jest.fn(() => Promise.resolve());
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptResultCard result={{ promptText: 'A crane shot.', sourceMessageId: 'm1', confidence: 'high' }} onExport={onExport} />); });
    await act(async () => { tree.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress(); });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('A crane shot.');
    await act(async () => { tree.root.findByProps({ accessibilityLabel: '导出 Prompt 到生成' }).props.onPress(); });
    expect(onExport).toHaveBeenCalledWith('A crane shot.');
    act(() => { jest.runAllTimers(); tree.unmount(); });
    jest.useRealTimers();
  });

  it('disables send while attachments are uploading', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<Composer value="" onChangeText={() => undefined} onSubmit={() => undefined} onOpenPicker={() => Promise.resolve()} onCancel={() => undefined} isRunning={false} attachments={[{ id: 'a1', status: 'uploading' }]} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '发送消息' }).props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('shows visible progress while the assistant is running', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={[]} isRunning onExportPrompt={() => Promise.resolve()} />); });
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '正在生成 Prompt…')).toBe(true);
    act(() => tree.unmount());
  });
});
