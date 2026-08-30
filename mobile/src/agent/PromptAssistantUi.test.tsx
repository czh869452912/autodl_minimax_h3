import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Text } from 'react-native';
import { pickAssistantImages } from './assistantImagePicker';
import { DraggableBottomSheet } from '../ui/DraggableSheet';

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

  it('places attachment, mention, and send actions below the multiline input', () => {
    const onMention = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <Composer
          value="draft"
          onChangeText={() => undefined}
          onSubmit={() => undefined}
          onOpenPicker={() => Promise.resolve()}
          onOpenMentionPicker={onMention}
          onCancel={() => undefined}
          isRunning={false}
          attachments={[]}
        />,
      );
    });
    const input = tree.root.findByProps({ placeholder: '描述你想生成的画面…' });
    const controls = tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string');
    expect(input.props.multiline).toBe(true);
    expect(tree.root.findByProps({ accessibilityLabel: '添加图片附件' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '引用图片附件' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '发送消息' })).toBeTruthy();
    expect(controls.length).toBeGreaterThanOrEqual(3);
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件' }).props.onPress());
    expect(onMention).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('opens an image mention sheet with ready attachments only', async () => {
    mockChatContext = {
      ...mockChatContext,
      attachments: [
        { id: 'ready-1', status: 'ready', filename: '角色正面.png', source: { value: 'file://ready-1' } },
        { id: 'uploading-1', status: 'uploading', filename: '上传中.png', source: { value: 'file://uploading-1' } },
      ],
    };
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
    expect(tree.root.findAllByProps({ accessibilityLabel: '引用图片附件' }).length).toBeGreaterThan(0);
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件' }).props.onPress());
    expect(tree.root.findAllByType(DraggableBottomSheet).filter((node) => node.props.visible)).toHaveLength(1);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '引用图片附件')).toBe(true);
    expect(tree.root.findByProps({ accessibilityLabel: '引用图片附件 角色正面.png' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '引用图片附件 上传中' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('keeps the rename dialog inside a keyboard-aware modal surface', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <PromptAssistantUi
          threads={[{ threadId: 't1', messages: [{ id: 'm1', role: 'user', content: '测试会话' }], state: {}, createdAt: 1, updatedAt: 1 }]}
          activeThreadId="t1"
          onSelect={() => undefined}
          onNew={() => undefined}
          onDelete={() => undefined}
          onRename={() => undefined}
          onExportPrompt={() => Promise.resolve()}
        />,
      );
    });
    act(() => tree.root.findByProps({ accessibilityLabel: '打开对话历史' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: '管理会话 t1' }).props.onPress());
    expect(tree.root.findAllByType(Modal).some((node) => node.props.visible)).toBe(true);
    expect(tree.root.findAllByType(KeyboardAvoidingView).length).toBeGreaterThanOrEqual(2);
    act(() => tree.unmount());
  });

  it('inserts a selected image mention at the current cursor and closes the sheet', async () => {
    mockChatContext = {
      ...mockChatContext,
      attachments: [
        { id: 'ready-1', status: 'ready', filename: '角色正面.png', source: { value: 'file://ready-1' } },
      ],
    };
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
    const input = tree.root.findByProps({ placeholder: '描述你想生成的画面…' });
    act(() => input.props.onChangeText('镜头前后'));
    act(() => input.props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 2 } } }));
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件 角色正面.png' }).props.onPress());
    expect(tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.value).toBe('镜头@角色正面 前后');
    expect(tree.root.findByProps({ testID: 'composer-toolbar-spacer' }).props.style).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
    expect(tree.root.findAllByType(Image).some((node) => node.props.source?.uri === 'file://ready-1')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '@角色正面')).toBe(true);
    const mentionLayer = tree.root.findByProps({ testID: 'mention-token-layer' });
    const richInput = tree.root.findByProps({ placeholder: '描述你想生成的画面…' });
    expect(mentionLayer.props.pointerEvents).toBe('none');
    expect(mentionLayer.findAllByType(Text).map((node) => node.props.children)).toEqual([
      '镜头',
      '@角色正面',
      ' ',
      '前后',
    ]);
    expect(mentionLayer.props.style).toEqual(
      expect.objectContaining({ position: 'absolute' }),
    );
    expect(richInput.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: 'transparent' })]),
    );
    expect(richInput.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0 })]),
    );
    expect(tree.root.findAllByProps({ accessibilityLabel: '引用图片附件 角色正面.png' })).toHaveLength(0);
    act(() => richInput.props.onSelectionChange({ nativeEvent: { selection: { start: 5, end: 5 } } }));
    const editingMentionLayer = tree.root.findByProps({ testID: 'mention-token-layer' });
    expect(editingMentionLayer.findAllByType(Text).some((node) => typeof node.props.children === 'string' && node.props.children.includes('@角色'))).toBe(true);
    expect(editingMentionLayer.findAllByProps({ testID: 'mention-token' })).toHaveLength(0);
    expect(editingMentionLayer.findAllByProps({ testID: 'mention-caret' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('sends every ready provider and gallery attachment even when only one is mentioned', async () => {
    const setPendingAttachments = jest.fn();
    mockChatContext = {
      ...mockChatContext,
      submitMessage: jest.fn(() => Promise.resolve()),
      attachments: [
        { id: 'provider-1', status: 'ready', filename: '场景.png', source: { value: 'file://provider-1' } },
      ],
      agent: { setPendingAttachments },
    };
    (pickAssistantImages as jest.Mock).mockResolvedValueOnce([
      { id: 'gallery-1', type: 'image', status: 'ready', filename: '角色.png', size: 10, source: { type: 'data', value: 'data:image/png;base64,abc', mimeType: 'image/png' } },
    ]);
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
    const pickerButtons = alert.mock.calls[0]?.[2] as Array<{ onPress?: () => void }>;
    await act(async () => pickerButtons[0]?.onPress?.());
    await act(async () => tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.onChangeText('使用角色'));
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: '发送消息' }).props.onPress();
    });
    expect(setPendingAttachments).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'gallery-1' })]),
      expect.any(Function),
    );
    expect(mockChatContext.submitMessage).toHaveBeenCalledWith('使用角色');
    const imageUris = tree.root.findAllByType(Image).map((node) => node.props.source?.uri);
    expect(imageUris).toEqual(expect.arrayContaining(['file://provider-1', 'data:image/png;base64,abc']));
    alert.mockRestore();
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

  it('does not subscribe to Android keyboard events or add a second lift', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const addListener = jest.spyOn(Keyboard, 'addListener');
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
      expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBeUndefined();
      act(() => {
        addListener.mock.calls
          .filter(([eventName]) => eventName === 'keyboardDidShow')
          .forEach(([, listener]) => listener({ endCoordinates: { screenY: -100 } } as never));
      });
      expect(tree.root.findByType(KeyboardAvoidingView).props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ paddingBottom: 8 })]),
      );
    } finally {
      act(() => tree?.unmount());
      addListener.mockRestore();
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('keeps native padding behavior on iOS', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
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
      expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBe('padding');
      expect(tree.root.findByType(KeyboardAvoidingView).props.keyboardVerticalOffset).toBe(0);
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
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '已停止生成')).toBe(true);
    act(() => tree.unmount());
  });
});
