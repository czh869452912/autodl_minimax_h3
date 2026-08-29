import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { pickAssistantImages } from './assistantImagePicker';

let mockChatContext: Record<string, unknown>;
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@copilotkit/react-native', () => ({ useCopilotChatContext: () => mockChatContext }));
jest.mock('@copilotkit/react-native/components', () => ({ CopilotMarkdown: ({ content }: { content: string }) => <>{content}</> }));
jest.mock('@copilotkit/shared', () => ({ getSourceUrl: (source: { value?: string }) => source.value || '' }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('./assistantImagePicker', () => ({ pickAssistantImages: jest.fn(() => Promise.resolve([])) }));

import { PromptAssistantUi, PromptResultCard, ToolTimeline, Composer, ConversationTimeline } from './PromptAssistantUi';

describe('Prompt assistant UI primitives', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatContext = {
      messages: [],
      isRunning: false,
      submitMessage: jest.fn(() => new Promise(() => undefined)),
      attachments: [],
      openPicker: jest.fn(),
      removeAttachment: jest.fn(),
      agent: {},
    };
  });

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

  it('offers gallery and file sources for image attachments', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <PromptAssistantUi
          threads={[{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }]}
          activeThreadId="t1"
          onSelect={() => undefined}
          onNew={() => undefined}
          onDelete={() => undefined}
          onRename={() => undefined}
          onExportPrompt={() => Promise.resolve()}
        />,
      );
    });

    act(() => tree.root.findByProps({ accessibilityLabel: '添加图片附件' }).props.onPress());
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.map((button) => button.text)).toEqual(['从相册选择', '从文件选择', '取消']);
    await act(async () => buttons[0].onPress?.());
    expect(pickAssistantImages).toHaveBeenCalledWith('gallery', 9);
    await act(async () => buttons[1].onPress?.());
    expect(mockChatContext.openPicker).toHaveBeenCalledTimes(1);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('shows visible progress while the assistant is running', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={[]} isRunning onExportPrompt={() => Promise.resolve()} />); });
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '正在生成 Prompt…')).toBe(true);
    act(() => tree.unmount());
  });

  it('keeps the composer above the Android keyboard', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    let tree!: ReturnType<typeof create>;
    try {
      act(() => {
        tree = create(
          <PromptAssistantUi
            threads={[{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }]}
            activeThreadId="t1"
            onSelect={() => undefined}
            onNew={() => undefined}
            onDelete={() => undefined}
            onRename={() => undefined}
            onExportPrompt={() => Promise.resolve()}
          />,
        );
      });
      expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBe('height');
    } finally {
      act(() => tree?.unmount());
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('auto-scrolls when streamed output changes size', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConversationTimeline rows={[]} isRunning onExportPrompt={() => Promise.resolve()} />);
    });
    const list = tree.root.findByType(FlatList);
    expect(typeof list.props.onContentSizeChange).toBe('function');
    expect(typeof list.props.onLayout).toBe('function');
    act(() => tree.unmount());
  });

  it('shows the submitted user bubble before the agent run resolves', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <PromptAssistantUi
          threads={[{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }]}
          activeThreadId="t1"
          onSelect={() => undefined}
          onNew={() => undefined}
          onDelete={() => undefined}
          onRename={() => undefined}
          onExportPrompt={() => Promise.resolve()}
        />,
      );
    });
    await act(async () => {
      tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.onChangeText('雨中的城市夜跑');
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: '发送消息' }).props.onPress();
    });
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '雨中的城市夜跑')).toBe(true);
    act(() => tree.unmount());
  });

  it('aborts the long-lived agent when stop is pressed', async () => {
    const abortRun = jest.fn();
    mockChatContext = { ...mockChatContext, isRunning: true, agent: { abortRun } };
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <PromptAssistantUi
          threads={[{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }]}
          activeThreadId="t1"
          onSelect={() => undefined}
          onNew={() => undefined}
          onDelete={() => undefined}
          onRename={() => undefined}
          onExportPrompt={() => Promise.resolve()}
        />,
      );
    });
    act(() => tree.root.findByProps({ accessibilityLabel: '停止生成' }).props.onPress());
    expect(abortRun).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
