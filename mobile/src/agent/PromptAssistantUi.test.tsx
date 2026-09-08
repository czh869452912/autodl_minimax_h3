import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Text } from 'react-native';
import { pickAssistantImages } from './assistantImagePicker';
import { DraggableBottomSheet } from '../ui/DraggableSheet';

let mockChatContext: Record<string, unknown>;
const mockMarkdownRender = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@copilotkit/react-native', () => ({ useCopilotChatContext: () => mockChatContext }));
jest.mock('@copilotkit/react-native/components', () => ({ CopilotMarkdown: ({ content }: { content: string }) => { mockMarkdownRender(content); return <>{content}</>; } }));
jest.mock('@copilotkit/shared', () => ({ getSourceUrl: (source: { value?: string }) => source.value || '' }));
jest.mock('../ui/icons', () => ({ AppIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('./assistantImagePicker', () => ({
  ...jest.requireActual('./assistantImagePicker'),
  pickAssistantImages: jest.fn(() => Promise.resolve([])),
}));

import { applyComposerSuggestion, PromptAssistantUi, PromptResultCard, ToolTimeline, Composer, ConversationTimeline, AttachmentStrip, ReferenceImagePreview, type RunIssue } from './PromptAssistantUi';
import { normalizeMessages } from './agentPresentation';
import { PromptVersionPanel } from './PromptVersionPanel';
import { RunTimelineRow } from './RunTimelineRow';
import * as timelineProjection from './timelineProjection';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { officialH3SkillManifest } from './skillBundle';

const basePromptProps = {
  threads: [{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }],
  activeThreadId: 't1',
  onSelect: () => undefined,
  onNew: () => undefined,
  onDelete: () => undefined,
  onRename: () => undefined,
  onExportPrompt: () => Promise.resolve(),
};

function PromptIssueHarness({
  initialIssue = null,
  onRetry = async () => undefined,
}: {
  initialIssue?: RunIssue | null;
  onRetry?: () => Promise<void>;
}) {
  const [runIssue, setRunIssue] = React.useState<RunIssue | null>(initialIssue);
  return (
    <PromptAssistantUi
      {...basePromptProps}
      runIssue={runIssue}
      onRunIssueChange={setRunIssue}
      onRetry={onRetry}
    />
  );
}

function renderedText(tree: ReturnType<typeof create>): string[] {
  return tree.root.findAllByType(Text).map((node) =>
    [node.props.children].flat(Infinity).join(''),
  );
}

describe('Prompt assistant UI primitives', () => {
  it('does not reproject a stable transcript for reasoning-only or composer updates', () => {
    const project = jest.fn(() => []);
    const factory = jest.spyOn(timelineProjection, 'createTimelineProjection').mockReturnValue(project);
    let tree!: ReturnType<typeof create>;
    try {
      const transcript = Array.from({ length: 2000 }, (_, index) => ({ id: `m${index}`, role: 'assistant', content: 'saved' }));
      act(() => { tree = create(<PromptAssistantUi {...basePromptProps} transcript={transcript} transcriptRevision={1} clientState={{}} />); });
      project.mockClear();
      for (let n = 0; n < 20; n++) act(() => tree.update(<PromptAssistantUi {...basePromptProps} transcript={[...transcript]} transcriptRevision={1} clientState={{ h3ReadAt: n }} />));
      expect(project).not.toHaveBeenCalled();
      act(() => tree.update(<PromptAssistantUi {...basePromptProps} transcript={transcript} transcriptRevision={2} clientState={{}} />));
      expect(project).toHaveBeenCalledTimes(1);
    } finally { if (tree) act(() => tree.unmount()); factory.mockRestore(); }
  });
  it('opens a queued run on start, preserves manual collapse, and bounds expanded text', () => {
    const run = { id: 'r', userMessageId: 'u', messageIds: [], status: 'queued' as const, startedAt: 1, tools: [] };
    const onInspect = jest.fn();
    const entries = [{ id: 'private-id', kind: 'reasoning' as const, text: 'x'.repeat(9000) + 'END' }];
    let tree!: ReturnType<typeof create>;
    const render = (status: 'queued' | 'running') => <RunTimelineRow run={{ ...run, status }} entries={entries} disabled onRetry={async () => undefined} onInspect={onInspect} />;
    act(() => { tree = create(render('queued')); });
    expect(tree.root.findByProps({ accessibilityLabel: '查看运行 r' }).props.accessibilityState.expanded).toBe(false);
    act(() => tree.update(render('running')));
    expect(tree.root.findByProps({ accessibilityLabel: '查看运行 r' }).props.accessibilityState.expanded).toBe(true);
    const item = tree.root.findByProps({ testID: 'process-item-private-id' });
    expect(item.props.accessibilityLabel).toBe('思考');
    act(() => item.props.onPress());
    expect(renderedText(tree).join('')).not.toContain('END');
    act(() => tree.root.findByProps({ accessibilityLabel: '下一段' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: '下一段' }).props.onPress());
    expect(renderedText(tree).join('')).toContain('END');
    onInspect.mockClear();
    act(() => tree.root.findByProps({ accessibilityLabel: '查看运行 r' }).props.onPress());
    expect(onInspect).not.toHaveBeenCalled();
    act(() => tree.update(render('running')));
    expect(tree.root.findByProps({ accessibilityLabel: '查看运行 r' }).props.accessibilityState.expanded).toBe(false);
    act(() => tree.unmount());
  });
  it('folds process messages together and expands complete tool output on demand', () => {
    const run = { id: 'r', userMessageId: 'u', messageIds: [], status: 'completed' as const, startedAt: 1, endedAt: 2, tools: [] };
    const output = 'Tool detail '.repeat(100) + 'END OF OUTPUT';
    const entries = [{ id: 'reason', kind: 'reasoning' as const, text: 'Inspect reference' }, { id: 'tool', kind: 'tool' as const, tool: { id: 'tool', name: 'read_file', status: 'complete' as const, startedAt: 1, endedAt: 2, arguments: '{"path":"/guide.md"}', output } }];
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<RunTimelineRow run={run} entries={entries} disabled={false} onRetry={async () => undefined} />); });
    expect(renderedText(tree).join('')).not.toContain('Inspect reference');
    act(() => tree.root.findByProps({ accessibilityLabel: '查看运行 r' }).props.onPress());
    expect(renderedText(tree).join('')).toContain('Inspect reference');
    expect(renderedText(tree).join('')).toContain('/guide.md');
    expect(renderedText(tree).join('')).not.toContain('END OF OUTPUT');
    act(() => tree.root.findByProps({ testID: 'process-item-tool' }).props.onPress());
    expect(renderedText(tree).join('')).toContain('END OF OUTPUT');
    act(() => tree.root.findByProps({ testID: 'process-item-tool' }).props.onPress());
    expect(renderedText(tree).join('')).not.toContain('END OF OUTPUT');
    act(() => tree.unmount());
  });
  it('omits empty assistant rows while retaining their anchored run and uncovered tools', () => {
    const rows = normalizeMessages([
      { id: 'u', role: 'user', content: 'Create a video' },
      { id: 'thinking', role: 'assistant', content: '' },
      { id: 'tools', role: 'assistant', content: '', toolCalls: [{ id: 't1', function: { name: 'read_file' } }] },
      { id: 'mixed', role: 'assistant', content: '', toolCalls: [{ id: 't1', function: { name: 'read_file' } }, { id: 't2', function: { name: 'ls' } }] },
    ]);
    const run = { id: 'r', userMessageId: 'u', messageIds: ['thinking', 'tools'], status: 'completed' as const, startedAt: 1, endedAt: 2, tools: [{ id: 't1', name: 'read_file', status: 'complete' as const, startedAt: 1, endedAt: 2 }] };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={rows} runs={[run]} isRunning={false} onExportPrompt={async () => undefined} />); });
    expect(tree.root.findByType(FlatList).props.data.map((row: { id: string }) => row.id)).toEqual(['u', 'run-r', 'mixed']);
    expect(tree.root.findByType(ToolTimeline).props.steps.map((step: { id: string }) => step.id)).toEqual(['t2']);
    act(() => tree.unmount());
  });

  it('does not render a completed Markdown row again while the tail streams', () => {
    const project = timelineProjection.createTimelineProjection();
    const older = { id: 'old', role: 'assistant', content: 'completed answer' };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={project([older, { id: 'tail', role: 'assistant', content: 'A' }])} completedMessageIds={['old']} isRunning onExportPrompt={async () => undefined} />); });
    mockMarkdownRender.mockClear();
    act(() => tree.update(<ConversationTimeline rows={project([older, { id: 'tail', role: 'assistant', content: 'AB' }])} completedMessageIds={['old']} isRunning onExportPrompt={async () => undefined} />));
    expect(mockMarkdownRender).toHaveBeenCalledWith('AB');
    expect(mockMarkdownRender).not.toHaveBeenCalledWith('completed answer');
    act(() => tree.unmount());
  });

  it('shares accessible image-preview ownership between composer and timeline', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<AttachmentStrip attachments={[{ id: 'image', status: 'ready', displayName: '图片1', source: { value: 'file:///image.png' } }]} onOpenPicker={async () => undefined} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '查看附件 图片1' }).props.onPress());
    expect(tree.root.findByType(ReferenceImagePreview).props.uri).toBe('file:///image.png');
    expect(tree.root.findByType(Modal).props.animationType).toBe('none');
    const close = tree.root.findByProps({ accessibilityLabel: '关闭图片预览' });
    expect(close.props.accessibilityRole).toBe('button');
    expect(close.props.style).toMatchObject({ width: 48, height: 48 });
    act(() => close.props.onPress());
    expect(tree.root.findByType(ReferenceImagePreview).props.uri).toBeNull();
    act(() => tree.unmount());
  });

  it('offers examples only for installed skill capabilities', () => {
    expect(officialH3SkillManifest['/skills/h3-prompt-writing/SKILL.md']).toBeTruthy();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptAssistantUi {...basePromptProps} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '使用建议 一镜到底的城市夜跑' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '使用建议 极简风格的香水广告' })).toBeTruthy();
    act(() => tree.unmount());
  });

  it('shows clipboard failures and clears copy feedback timers on unmount', async () => {
    jest.useFakeTimers();
    const schedule = jest.spyOn(global, 'setTimeout');
    const cancel = jest.spyOn(global, 'clearTimeout');
    let tree!: ReturnType<typeof create>;
    try {
      jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('clipboard unavailable'));
      act(() => { tree = create(<PromptResultCard result={{ promptText: 'Prompt', sourceMessageId: 'm', confidence: 'high' }} onExport={async () => undefined} />); });
      await act(async () => tree.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
      expect(renderedText(tree)).toContain('复制失败，请重试');
      await act(async () => tree.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress());
      expect(renderedText(tree)).toContain('已复制');
      const feedbackTimers = schedule.mock.calls.flatMap((call, index) => call[1] === 1600 ? [schedule.mock.results[index].value] : []);
      act(() => tree.unmount());
      expect(feedbackTimers).toHaveLength(2);
      feedbackTimers.forEach(timer => expect(cancel).toHaveBeenCalledWith(timer));
    } finally { schedule.mockRestore(); cancel.mockRestore(); jest.useRealTimers(); }
  });

  it('reports response copy failures without leaking a late clipboard completion', async () => {
    jest.useFakeTimers();
    const schedule = jest.spyOn(global, 'setTimeout');
    let tree!: ReturnType<typeof create>;
    try {
      const rows = normalizeMessages([{ id: 'a', role: 'assistant', content: 'Answer' }]);
      act(() => { tree = create(<ConversationTimeline rows={rows} isRunning={false} onExportPrompt={async () => undefined} />); });
      jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('clipboard unavailable'));
      await act(async () => tree.root.findByProps({ accessibilityLabel: '复制回答 a' }).props.onPress());
      expect(renderedText(tree)).toContain('复制失败，请重试');
      let resolve!: (value: boolean) => void;
      jest.mocked(Clipboard.setStringAsync).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
      act(() => tree.root.findByProps({ accessibilityLabel: '复制回答 a' }).props.onPress());
      act(() => tree.unmount());
      schedule.mockClear();
      await act(async () => resolve(true));
      expect(schedule.mock.calls.some(call => call[1] === 1600)).toBe(false);
    } finally { schedule.mockRestore(); jest.useRealTimers(); }
  });

  it('keeps cached timeline rows immutable when applying run tool status', () => {
    const row = Object.freeze({ id: 'a', kind: 'assistant' as const, text: 'Answer', tools: [{ id: 'tool', name: 'read_file', status: 'running' as const }] });
    const projection = jest.spyOn(timelineProjection, 'createTimelineProjection').mockReturnValue(() => [row] as never);
    let tree!: ReturnType<typeof create>;
    try {
      act(() => { tree = create(<PromptAssistantUi {...basePromptProps} clientState={{ h3Runs: [{ id: 'r', userMessageId: 'u', status: 'completed', startedAt: 1, messageIds: ['a'], tools: [{ id: 'tool', name: 'read_file', status: 'complete' }] }] }} />); });
      expect(tree.root.findByType(RunTimelineRow).props.run.tools[0].status).toBe('complete');
      expect(tree.root.findByType(ConversationTimeline).props.rows[0].tools[0].status).toBe('running');
      act(() => tree.update(<PromptAssistantUi {...basePromptProps} clientState={{}} />));
      expect(tree.root.findByType(ConversationTimeline).props.rows[0].tools[0].status).toBe('running');
      expect(row.tools[0].status).toBe('running');
      act(() => tree.unmount());
    } finally { projection.mockRestore(); }
  });

  it('waits for the active workflow and displays catalog failures before mounting the version panel', () => {
    const definition = require('../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json') as WorkflowDefinition;
    const state = { h3Versions: [{ id: 'v', promptText: 'Prompt', sourceMessageId: 'm', createdAt: 1, images: [], parameters: {} }] };
    const reload = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptAssistantUi {...basePromptProps} clientState={state} onReloadWorkflow={reload} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '打开 Prompt 版本' }).props.onPress());
    expect(tree.root.findAllByType(PromptVersionPanel)).toHaveLength(0);
    expect(renderedText(tree)).toContain('正在加载工作流…');
    act(() => tree.update(<PromptAssistantUi {...basePromptProps} clientState={state} workflowLoadIssue="catalog unavailable" onReloadWorkflow={reload} />));
    expect(tree.root.findAllByType(PromptVersionPanel)).toHaveLength(0);
    expect(renderedText(tree)).toContain('catalog unavailable');
    act(() => tree.root.findByProps({ accessibilityLabel: '重新加载工作流' }).props.onPress());
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => tree.update(<PromptAssistantUi {...basePromptProps} clientState={state} workflowDefinition={definition} />));
    expect(tree.root.findByType(PromptVersionPanel).props.workflowDefinition).toBe(definition);
    act(() => tree.unmount());
  });

  it('preserves a newer draft after delayed acceptance and shows errors with prior runs', async () => {
    let resolve!: () => void;
    const accepted = new Promise<void>(done => { resolve = done; });
    mockChatContext = { messages: [], isRunning: false, attachments: [], agent: {}, removeAttachment: jest.fn() };
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<PromptAssistantUi {...basePromptProps} onAccept={() => accepted} clientState={{ h3Runs: [{ id: 'old', status: 'completed', userMessageId: 'u', startedAt: 1, messageIds: [], tools: [] }] }} runIssue={{ kind: 'error', message: '存储失败' }} />); });
    expect(renderedText(tree)).toContain('存储失败');
    act(() => tree.root.findByType(Composer).props.onChangeText('first'));
    act(() => { void tree.root.findByType(Composer).props.onSubmit('first'); });
    act(() => tree.root.findByType(Composer).props.onChangeText('new draft'));
    await act(async () => resolve());
    expect(tree.root.findByType(Composer).props.value).toBe('new draft');
    act(() => tree.unmount());
  });
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
    act(() => { tree = create(<PromptResultCard ready result={{ promptText: 'A crane shot.', sourceMessageId: 'm1', confidence: 'high' }} onExport={onExport} />); });
    await act(async () => { tree.root.findByProps({ accessibilityLabel: '复制 Prompt' }).props.onPress(); });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('A crane shot.');
    await act(async () => { tree.root.findByProps({ accessibilityLabel: '导出 Prompt 到生成' }).props.onPress(); });
    expect(onExport).toHaveBeenCalledWith('A crane shot.');
    act(() => { jest.runAllTimers(); tree.unmount(); });
    jest.useRealTimers();
  });

  it('does not export unconfirmed or interrupted prompt output', async () => {
    const onExport = jest.fn(async () => undefined);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptResultCard result={{ promptText: 'integrated_multimodal_description: Partial', sourceMessageId: 'm', confidence: 'high' }} onExport={onExport} />); });
    const button = tree.root.findByProps({ accessibilityLabel: '导出 Prompt 到生成' });
    expect(button.props.disabled).toBe(true);
    await act(async () => { button.props.onPress(); });
    expect(onExport).not.toHaveBeenCalled();
    expect(renderedText(tree)).not.toContain('FINAL H3 PROMPT');
    act(() => tree.unmount());
  });

  it('restores a session draft and keeps the composer editable during generation', () => {
    mockChatContext.isRunning = true;
    const onClientStateChange = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptAssistantUi {...basePromptProps} clientState={{ h3Composer: { text: '下一轮的修改', attachments: [] } }} onClientStateChange={onClientStateChange} />); });
    const composer = tree.root.findByType(Composer);
    expect(composer.props.value).toBe('下一轮的修改');
    const input = tree.root.findAll(node => node.props.placeholder === '描述你的视频创意，或继续修改 Prompt…')[0];
    if (input) expect(input.props.editable).not.toBe(false);
    act(() => composer.props.onChangeText('再加雨景'));
    expect(onClientStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ h3Composer: expect.objectContaining({ text: '再加雨景' }) }));
    act(() => tree.unmount());
  });

  it('renders persisted failed attempts and retries the selected run', async () => {
    const onRetry = jest.fn(async () => undefined);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={normalizeMessages([{ id: 'u1', role: 'user', content: 'first' }])} isRunning={false} onExportPrompt={async () => undefined} runs={[{ id: 'run1', userMessageId: 'u1', status: 'failed', startedAt: 1, endedAt: 1001, error: '网络中断', messageIds: [], tools: [] }]} onRetry={onRetry} />); });
    expect(renderedText(tree)).toContain('网络中断');
    await act(async () => tree.root.findByProps({ accessibilityLabel: '重试运行 run1' }).props.onPress());
    expect(onRetry).toHaveBeenCalledWith('run1');
    act(() => tree.unmount());
  });

  it('keeps hidden completed runs unread until the user returns', () => {
    const onClientStateChange = jest.fn();
    const props = { ...basePromptProps, clientState: { h3Runs: [{ id: 'r', userMessageId: 'u', status: 'completed', startedAt: 1, endedAt: 2, messageIds: [], tools: [] }] }, onClientStateChange };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptAssistantUi {...props} isVisible={false} />); });
    expect(onClientStateChange.mock.calls.some(([patch]) => 'h3ReadAt' in patch)).toBe(false);
    act(() => tree.update(<PromptAssistantUi {...props} isVisible />));
    expect(onClientStateChange.mock.calls.some(([patch]) => patch.h3ReadAt >= 2)).toBe(true);
    act(() => tree.unmount());
  });

  it('opens a historical reference image for inspection', () => {
    let tree!: ReturnType<typeof create>;
    const rows = normalizeMessages([{ id: 'u', role: 'user', content: [{ type: 'text', text: '@图片1' }, { type: 'image_url', image_url: { url: 'file:///reference.png' } }] }]);
    act(() => { tree = create(<ConversationTimeline rows={rows} isRunning={false} onExportPrompt={async () => undefined} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '查看参考图片 u 图片1' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'reference-image-preview' }).props.source.uri).toBe('file:///reference.png');
    act(() => tree.unmount());
  });

  it('opens creative information in a two-stop bottom drawer with a fixed submit action', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptAssistantUi {...basePromptProps} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '补充创作信息' }).props.onPress());
    const sheet = tree.root.findAllByType(DraggableBottomSheet).find(node => node.props.title === '补充创作信息');
    expect(sheet?.props.visible).toBe(true);
    expect(sheet?.props.footer).toBeTruthy();
    expect(tree.root.findAllByType(Text).some(node => node.props.children === '返回对话')).toBe(false);
    act(() => tree.unmount());
  });

  it('exports only successfully completed message IDs, including after restoring a session', () => {
    const rows = normalizeMessages([{ id: 'm', role: 'assistant', content: '```h3-prompt\nintegrated_multimodal_description: Cat runs.\noverall_soundscape: Wind.\nnon_diegetic_music: None.\n```' }]);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={rows} isRunning={false} onExportPrompt={async () => undefined} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '导出 Prompt 到生成' }).props.disabled).toBe(true);
    act(() => tree.update(<ConversationTimeline rows={rows} isRunning={false} completedMessageIds={['m']} onExportPrompt={async () => undefined} />));
    expect(tree.root.findByProps({ accessibilityLabel: '导出 Prompt 到生成' }).props.disabled).toBe(false);
    act(() => tree.update(<ConversationTimeline rows={rows} isRunning completedMessageIds={['m']} onExportPrompt={async () => undefined} />));
    expect(tree.root.findByProps({ accessibilityLabel: '导出 Prompt 到生成' }).props.disabled).toBe(true);
    act(() => tree.unmount());
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
    expect(tree.root.findByProps({ accessibilityLabel: '引用图片附件 图片1' })).toBeTruthy();
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
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件 图片1' }).props.onPress());
    expect(tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.value).toBe('镜头@图片1 前后');
    expect(tree.root.findByProps({ testID: 'composer-toolbar-spacer' }).props.style).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
    expect(tree.root.findAllByType(Image).some((node) => node.props.source?.uri === 'file://ready-1')).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'mention-token-layer' })).toHaveLength(0);
    const richInput = tree.root.findByProps({ placeholder: '描述你想生成的画面…' });
    expect(richInput.props.caretHidden).not.toBe(true);
    expect(richInput.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ color: 'transparent' })]),
    );
    expect(tree.root.findAllByProps({ accessibilityLabel: '引用图片附件 图片1' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('sends every ready provider and gallery attachment even when only one is mentioned', async () => {
    const accept = jest.fn(async () => undefined);
    const setPendingAttachments = jest.fn();
    const setPendingImageIdentities = jest.fn();
    mockChatContext = {
      ...mockChatContext,
      submitMessage: jest.fn(() => Promise.resolve()),
      attachments: [
        { id: 'provider-1', status: 'ready', size: 10, filename: '场景.png', source: { value: 'file://provider-1' } },
      ],
      agent: { setPendingAttachments, setPendingImageIdentities },
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
          onAccept={accept}
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
    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ text: '使用角色', attachments: [expect.objectContaining({ id: 'provider-1', displayName: '图片1' }), expect.objectContaining({ id: 'gallery-1', displayName: '图片2' })] }));
    expect(setPendingAttachments).not.toHaveBeenCalled();
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
    expect(pickAssistantImages).toHaveBeenCalledWith('file', 9);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('shows visible progress while the assistant is running', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={[]} isRunning onExportPrompt={() => Promise.resolve()} />); });
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '正在生成 Prompt…')).toBe(true);
    act(() => tree.unmount());
  });

  it('shows only one progress indicator before the first visible response', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={normalizeMessages([{ id: 'thinking', role: 'assistant', content: '' }])} isRunning onExportPrompt={async () => undefined} />); });
    expect(renderedText(tree).filter(text => text === '正在生成 Prompt…')).toHaveLength(1);
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('avoids actual Android container overlap without subtracting a hidden tab bar', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    let tree!: ReturnType<typeof create>;
    try {
      act(() => { tree = create(<PromptAssistantUi threads={[]} activeThreadId="t1" onSelect={() => undefined} onNew={() => undefined} onDelete={() => undefined} onRename={() => undefined} onExportPrompt={async () => undefined} />); });
      const root = tree.root.findByType(KeyboardAvoidingView);
      expect(root.props.behavior).toBe('padding');
      // RN 0.86.3 integration probe: these private methods must be rechecked on RN upgrades.
      // Edge-to-edge overlay: removing the tab bar grows the container to 800.
      await act(async () => root.instance._onLayout({ persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } }));
      expect(await root.instance._relativeKeyboardHeight({ screenY: 500, height: 300 })).toBe(300);
      // Native adjustResize already brought the container above the keyboard.
      await act(async () => root.instance._onLayout({ persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 500 } } }));
      expect(await root.instance._relativeKeyboardHeight({ screenY: 500, height: 300 })).toBe(0);
      act(() => tree.root.findByProps({ accessibilityLabel: '打开对话历史' }).props.onPress());
      expect(tree.root.findAllByType(KeyboardAvoidingView)[0].props.enabled).toBe(false);
    } finally {
      act(() => tree?.unmount());
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('keeps keyboard avoidance enabled when history is an inline tablet sidebar', () => {
    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 1200, height: 800, scale: 1, fontScale: 1 });
    let tree!: ReturnType<typeof create>;
    try {
      act(() => { tree = create(<PromptAssistantUi threads={[]} activeThreadId="t1" onSelect={() => undefined} onNew={() => undefined} onDelete={() => undefined} onRename={() => undefined} onExportPrompt={async () => undefined} />); });
      act(() => tree.root.findByProps({ accessibilityLabel: '打开对话历史' }).props.onPress());
      expect(tree.root.findAllByType(KeyboardAvoidingView)[0].props.enabled).toBe(true);
    } finally { act(() => tree?.unmount()); dimensions.mockRestore(); }
  });

  it('suspends tablet keyboard avoidance only while the rename modal is open', () => {
    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 1200, height: 800, scale: 1, fontScale: 1 });
    let tree!: ReturnType<typeof create>;
    try {
      act(() => { tree = create(<PromptAssistantUi threads={[{ threadId: 't1', messages: [], state: {}, createdAt: 1, updatedAt: 1 }]} activeThreadId="t1" onSelect={() => undefined} onNew={() => undefined} onDelete={() => undefined} onRename={() => undefined} onExportPrompt={async () => undefined} />); });
      const root = () => tree.root.findAllByType(KeyboardAvoidingView)[0];
      expect(root().props.enabled).toBe(true);
      act(() => tree.root.findByProps({ accessibilityLabel: '管理会话 t1' }).props.onPress());
      expect(root().props.enabled).toBe(false);
      act(() => tree.root.findAllByType(Modal).find(node => node.props.visible)!.props.onRequestClose());
      expect(root().props.enabled).toBe(true);
    } finally { act(() => tree?.unmount()); dimensions.mockRestore(); }
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

  it('preserves the viewport while the user reads older messages', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConversationTimeline rows={[]} isRunning onExportPrompt={() => Promise.resolve()} />);
    });
    const list = tree.root.findByType(FlatList);
    act(() => list.props.onScrollBeginDrag());
    expect(tree.root.findByProps({ accessibilityLabel: '回到最新消息' })).toBeTruthy();

    act(() => list.props.onContentSizeChange(320, 1200));
    expect(tree.root.findByProps({ accessibilityLabel: '回到最新消息' })).toBeTruthy();
    act(() => tree.unmount());
  });

  it('restores latest-message following at the bottom or by explicit action', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConversationTimeline rows={[]} isRunning onExportPrompt={() => Promise.resolve()} />);
    });
    let list = tree.root.findByType(FlatList);
    act(() => list.props.onScrollBeginDrag());
    act(() => list.props.onScrollEndDrag({
      nativeEvent: {
        contentOffset: { y: 500 },
        layoutMeasurement: { height: 500 },
        contentSize: { height: 1000 },
      },
    }));
    expect(tree.root.findAllByProps({ accessibilityLabel: '回到最新消息' })).toHaveLength(0);

    list = tree.root.findByType(FlatList);
    act(() => list.props.onScrollBeginDrag());
    act(() => tree.root.findByProps({ accessibilityLabel: '回到最新消息' }).props.onPress());
    expect(tree.root.findAllByProps({ accessibilityLabel: '回到最新消息' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('keeps an unaccepted draft without inventing a user bubble', async () => {
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
    expect(tree.root.findByType(Composer).props.value).toBe('雨中的城市夜跑');
    expect(tree.root.findByType(ConversationTimeline).props.rows).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('ignores repeated sends while the first assistant run is pending', async () => {
    let resolve!: () => void;
    const submitMessage = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
    mockChatContext = { ...mockChatContext, submitMessage, isRunning: false };
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
          onAccept={() => submitMessage()}
        />,
      );
    });
    await act(async () => tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.onChangeText('只发送一次'));
    const send = tree.root.findByProps({ accessibilityLabel: '发送消息' });
    act(() => { send.props.onPress(); send.props.onPress(); });
    expect(submitMessage).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ accessibilityLabel: '停止生成' })).toBeTruthy();
    await act(async () => { resolve(); });
    act(() => tree.unmount());
  });

  it('keeps user message text selectable for copying without attachments', () => {
    const rows = normalizeMessages([{ id: 'm1', role: 'user', content: '只复制这段文字', attachments: [{ type: 'image', filename: 'secret.png', source: { value: 'file://secret' } }] }]);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={rows} isRunning={false} onExportPrompt={() => Promise.resolve()} />); });
    const userText = tree.root.findByProps({ testID: 'user-message-text' });
    expect(userText.props.selectable).toBe(true);
    act(() => tree.unmount());
  });

  it('renders sent image tokens inline while keeping the whole user text selectable', () => {
    const rows = normalizeMessages([{ id: 'm1', role: 'user', content: '参考 @图片1 完成画面', attachments: [{ type: 'image', filename: 'ref.png', source: { value: 'file://secret' } }] }]);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<ConversationTimeline rows={rows} isRunning={false} onExportPrompt={() => Promise.resolve()} />); });
    const userText = tree.root.findByProps({ testID: 'user-message-text' });
    expect(userText.props.selectable).toBe(true);
    expect(userText.findAllByProps({ testID: 'user-image-mention' }).length).toBeGreaterThan(0);
    expect(userText.findByProps({ testID: 'user-image-mention-thumbnail' }).props.source.uri).toBe('file://secret');
    act(() => tree.unmount());
  });

  it('removes an image mention atomically when the controlled input reports a backspace edit', async () => {
    mockChatContext = {
      ...mockChatContext,
      attachments: [{ id: 'ready-1', status: 'ready', filename: '100000003.png', source: { value: 'file://ready-1' } }],
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
    act(() => input.props.onChangeText('镜头'));
    act(() => input.props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 2 } } }));
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件 图片1' }).props.onPress());
    const editedInput = tree.root.findByProps({ placeholder: '描述你想生成的画面…' });
    act(() => editedInput.props.onChangeText('镜头@图片 '));
    expect(tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.value).toBe('镜头 ');
    expect(tree.root.findAllByProps({ testID: 'mention-token-layer' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('keeps an image token atomic after deleting plain text before it', async () => {
    mockChatContext = {
      ...mockChatContext,
      attachments: [{ id: 'ready-1', status: 'ready', filename: '100000003.png', source: { value: 'file://ready-1' } }],
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
    act(() => input.props.onChangeText('abc'));
    act(() => input.props.onSelectionChange({ nativeEvent: { selection: { start: 3, end: 3 } } }));
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件' }).props.onPress());
    act(() => tree.root.findByProps({ accessibilityLabel: '引用图片附件 图片1' }).props.onPress());
    act(() => tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.onChangeText('ab@图片1 '));
    act(() => tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.onChangeText('ab@图片 '));
    expect(tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.value).toBe('ab ');
    act(() => tree.unmount());
  });

  it('aborts the long-lived agent when stop is pressed', async () => {
    const abortRun = jest.fn();
    mockChatContext = { ...mockChatContext, isRunning: true, agent: { abortRun } };
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<PromptIssueHarness />);
    });
    act(() => tree.root.findByProps({ accessibilityLabel: '停止生成' }).props.onPress());
    expect(abortRun).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(Text).some((node) => node.props.children === '已停止生成')).toBe(true);
    act(() => tree.unmount());
  });

  it('renders an inline retry for the last failed round without resubmitting input', async () => {
    const onRetry = jest.fn(async () => undefined);
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PromptIssueHarness
          initialIssue={{ kind: 'error', message: '网络失败' }}
          onRetry={onRetry}
        />,
      );
    });
    expect(tree.root.findByProps({ accessibilityLabel: '重试上一轮' })).toBeTruthy();
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: '重试上一轮' }).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(mockChatContext.submitMessage).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('renders an aborted issue inline after stop', () => {
    const abortRun = jest.fn();
    mockChatContext = { ...mockChatContext, isRunning: true, agent: { abortRun } };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PromptIssueHarness />); });
    act(() => tree.root.findByProps({ accessibilityLabel: '停止生成' }).props.onPress());
    expect(abortRun).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ accessibilityLabel: '重试上一轮' })).toBeTruthy();
    expect(renderedText(tree)).toContain('已停止生成');
    act(() => tree.unmount());
  });

  it('resets issue state when the thread-keyed session changes', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <PromptIssueHarness
          key="thread-1"
          initialIssue={{ kind: 'error', message: '旧错误' }}
        />,
      );
    });
    expect(renderedText(tree)).toContain('旧错误');
    act(() => { tree.update(<PromptIssueHarness key="thread-2" />); });
    expect(renderedText(tree)).not.toContain('旧错误');
    act(() => tree.unmount());
  });

  it('copies only the selected assistant body', async () => {
    const rows = normalizeMessages([
      { id: 'a1', role: 'assistant', content: '第一条' },
      { id: 'a2', role: 'assistant', content: '第二条' },
    ]);
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ConversationTimeline
          rows={rows}
          isRunning={false}
          onExportPrompt={() => Promise.resolve()}
        />,
      );
    });
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: '复制回答 a2' }).props.onPress();
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('第二条');
    act(() => tree.unmount());
  });

  it('fills and focuses the composer without submitting a suggestion', () => {
    const focus = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<PromptAssistantUi {...basePromptProps} />, {
        createNodeMock: () => ({ focus, scrollToEnd: jest.fn() }),
      });
    });
    act(() => {
      tree.root.findByProps({
        accessibilityLabel: '使用建议 一镜到底的城市夜跑',
      }).props.onPress();
    });
    expect(tree.root.findByProps({ placeholder: '描述你想生成的画面…' }).props.value)
      .toBe('一镜到底的城市夜跑');
    expect(mockChatContext.submitMessage).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('focuses the composer when applying a suggestion', () => {
    const setDraft = jest.fn();
    const setSelection = jest.fn();
    const focus = jest.fn();
    applyComposerSuggestion(
      '纸艺风格的产品广告',
      setDraft,
      setSelection,
      { current: { focus } },
    );
    expect(setDraft).toHaveBeenCalledWith('纸艺风格的产品广告');
    expect(setSelection).toHaveBeenCalledWith({ start: 9, end: 9 });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
