import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCopilotChatContext } from '@copilotkit/react-native';
import { CopilotMarkdown } from '@copilotkit/react-native/components';
import { getSourceUrl } from '@copilotkit/shared';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  AccessibilityInfo,
  findNodeHandle,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS, LIGHT_PROMPT_COLORS } from '../ui/theme';
import { mergeUniqueAssistantAttachments, pickAssistantImages, type AssistantImageAttachment } from './assistantImagePicker';
import {
  insertImageMention,
  removeImageMentionOnBackspace,
  assignImageDisplayNames,
  rebuildImageMentions,
} from './imageMentions';
import {
  groupSessions,
  matchesSessionQuery,
  normalizeMessages,
  sessionDisplayTitle,
  sessionMessageCount,
  sessionTitle,
  toolTimelineSummary,
  type ToolTimelineStep,
  type PresentationMessage,
} from './agentPresentation';
import { type PromptParseResult } from './promptParser';
import type { LocalThreadSnapshot } from './threadStore';
import { DraggableBottomSheet, type DraggableBottomSheetHandle } from '../ui/DraggableSheet';
import { nextFollowState, type TimelineMetrics } from './timelineScroll';
import { readComposerDraft, sessionRunLabel } from './assistantWorkspace';
import { readPromptRuns, type PromptRun } from './runState';
import { RunTimelineRow } from './RunTimelineRow';
import { enrichRunTools, indexRunTools, projectRunTimeline } from './runTimeline';
import { readPromptVersions, restorePromptVersion } from './promptVersions';
import { PromptVersionPanel } from './PromptVersionPanel';
import type { PromptHandoff } from './promptHandoff';
import { createAgentId } from './submissionCommands';
import { validateImageBudget } from './attachmentStore';
import { createTimelineProjection } from './timelineProjection';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { officialH3SkillManifest } from './skillBundle';

type AttachmentLike = {
  id: string;
  status: 'uploading' | 'ready';
  source?: { type?: string; value?: string; url?: string };
  filename?: string;
  displayName?: string;
  size?: number;
};
type HistoryProps = {
  threads: LocalThreadSnapshot[];
  activeThreadId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSearchHistory?: (query: string) => void;
  onLoadMoreHistory?: () => void;
};

export type RunIssue = { kind: 'error' | 'aborted'; message: string; runId?: string };

export function applyComposerSuggestion(
  value: string,
  setDraft: (value: string) => void,
  setSelection: (selection: { start: number; end: number }) => void,
  input: { current: { focus: () => void } | null },
): void {
  setDraft(value);
  setSelection({ start: value.length, end: value.length });
  input.current?.focus();
}

export function PromptAssistantUi({
  threads,
  activeThreadId,
  onSelect: onSelectThread,
  onNew: onNewThread,
  onDelete: onDeleteThread,
  onRename: onRenameThread,
  onExportPrompt,
  onExportHandoff,
  clientState,
  onClientStateChange,
  isVisible = true,
  notice,
  runIssue = null,
  onRunIssueChange = () => undefined,
  onRetry = async () => undefined,
  onAccept,
  onSearchHistory,
  onLoadMoreHistory,
  transcript,
  transcriptRevision,
  workflowDefinition,
  workflowLoadIssue,
  onReloadWorkflow,
}: HistoryProps & {
  onExportPrompt: (prompt: string, artifactId?: string) => Promise<void>;
  onExportHandoff?: (handoff: PromptHandoff) => Promise<void>;
  clientState?: Record<string, unknown>;
  onClientStateChange?: (patch: Record<string, unknown>) => void;
  isVisible?: boolean;
  notice?: string;
  runIssue?: RunIssue | null;
  onRunIssueChange?: (issue: RunIssue | null) => void;
  onRetry?: (runId?: string) => Promise<void>;
  onAccept?: (input: { id: string; text: string; attachments: unknown[]; draftRevision: number }) => Promise<void>;
  transcript?: readonly unknown[];
  transcriptRevision?: number;
  workflowDefinition?: WorkflowDefinition;
  workflowLoadIssue?: string;
  onReloadWorkflow?: () => void;
}) {
  const {
    messages,
    isRunning,
    attachments,
    removeAttachment,
    agent,
  } = useCopilotChatContext();
  const state = clientState ?? agent.state ?? {};
  const initialComposer = useRef(readComposerDraft(state)).current;
  const [draft, setDraft] = useState(initialComposer.text);
  const draftRef = useRef(draft); draftRef.current = draft;
  const draftRevision = useRef(Number((state.h3Composer as any)?.revision) || 0);
  const [galleryAttachments, setGalleryAttachments] = useState<AssistantImageAttachment[]>(initialComposer.attachments);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const versionSheet = useRef<DraggableBottomSheetHandle>(null);
  const briefSheet = useRef<DraggableBottomSheetHandle>(null);
  const [brief, setBrief] = useState({ subject: '', camera: '', style: '', duration: '' });
  // Runtime snapshots are published at a bounded rate. The SDK-only fallback
  // remains uncached because the SDK can mutate its message array in place.
  const projectionRevision = transcriptRevision ?? clientState;
  const transcriptKey = transcriptRevision === undefined ? transcript : activeThreadId;
  const toolIndex = useMemo(() => transcript ? indexRunTools(transcript) : undefined, [transcriptKey, projectionRevision]);
  const cachedRuns = useMemo(() => transcript ? enrichRunTools(readPromptRuns(state), transcript, toolIndex) : null, [transcriptKey, toolIndex, state.h3Runs]);
  const runs = cachedRuns ?? enrichRunTools(readPromptRuns(state), messages);
  const completedMessageIds = useMemo(() => Array.isArray(state.h3CompletedMessageIds) ? state.h3CompletedMessageIds.filter((id: unknown): id is string => typeof id === 'string') : [], [state.h3CompletedMessageIds]);
  const savedVersions = useMemo(() => readPromptVersions(state), [state.h3Versions]);
  const versions = savedVersions;
  const latestEnd = runs.reduce((time, run) => Math.max(time, run.endedAt ?? 0), 0);
  useEffect(() => { if (isVisible) onClientStateChange?.({ h3ReadAt: Date.now() }); }, [activeThreadId, latestEnd, isVisible, onClientStateChange]);
  const [inputSelection, setInputSelection] = useState({ start: initialComposer.text.length, end: initialComposer.text.length });
  const [mentionSheetOpen, setMentionSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const attachmentNames = useRef(new Map(initialComposer.attachments.map(item => [item.id, item.displayName ?? '图片1'])));
  const nextAttachmentNumber = useRef(1 + Math.max(0, ...initialComposer.attachments.map(item => Number(item.displayName?.replace('图片', '')) || 0)));
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState<number | null>(null);
  // Keep the keyboard-hidden height captured at mount. Updating this while
  // Android is resizing the window would make the resize delta look like zero
  // and re-apply the full keyboard height (the extra tab-bar-sized lift seen
  // on some edge-to-edge devices).
  const baselineHeight = useRef(height);
  useEffect(() => { if (keyboardHeight === null) baselineHeight.current = height; }, [height, width, keyboardHeight]);
  const wide = width >= 900 && height >= 480;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(null);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  const keyboardPadding =
    Platform.OS === 'android' && keyboardHeight != null
      ? getKeyboardAvoidancePadding(
        height,
        keyboardHeight,
        baselineHeight.current,
        // The custom tab bar is hidden by React Navigation while the keyboard
        // is open. Its freed layout space must not be treated as keyboard
        // overlap, otherwise the composer rises by one tab-bar height.
        8 + 66 + Math.max(insets.bottom, 8),
      )
      : 0;
  // AbstractAgent mutates its messages array when addMessage() is called. Do
  // not memoize by array identity or the first user bubble waits for the next
  // streamed event before becoming visible.
  const projectTimeline = useRef(createTimelineProjection()).current;
  const cachedRows = useMemo(() => transcript ? projectTimeline(transcript) : null, [transcriptKey, projectionRevision, projectTimeline]);
  const rows = cachedRows ?? projectTimeline(messages);
  const handleSubmit = async (value: string) => {
    if (submitLock.current || isRunning) return;
    const ready = [...attachments.filter((item) => item.status === 'ready'), ...galleryAttachments];
    if (!value.trim() && !ready.length)
      return;
    submitLock.current = true;
    setSubmitting(true);
    onRunIssueChange(null);
      const revision = draftRevision.current;
      const submittedIds = new Set(ready.map(item => item.id));
      try {
        if (!onAccept) throw new Error('提交服务尚未就绪，草稿已保留');
        validateImageBudget(ready);
        await onAccept({ id: createAgentId(), text: value, draftRevision: revision, attachments: ready.map(item => ({ ...item, displayName: composerAttachments.find(named => named.id === item.id)?.displayName, metadata: { ...(item as any).metadata, displayName: composerAttachments.find(named => named.id === item.id)?.displayName, attachmentId: item.id } })) });
        if (draftRef.current === value && draftRevision.current === revision) { setDraft(''); setInputSelection({ start: 0, end: 0 }); }
        setGalleryAttachments(current => current.filter(item => !submittedIds.has(item.id)));
        for (const item of attachments) if (submittedIds.has(item.id)) removeAttachment(item.id);
      } catch (reason) { onRunIssueChange({ kind: 'error', message: reason instanceof Error ? reason.message : '发送失败，草稿已保留' }); }
      finally { submitLock.current = false; setSubmitting(false); }
  };
  const pickerLock = useRef(false);
  const returnToMentions = useRef(false);
  const addGalleryImages = async (source: 'gallery' | 'file' = 'gallery') => {
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const remaining = Math.max(0, 9 - attachments.filter((item) => item.status === 'ready').length - galleryAttachments.length);
      const picked = await pickAssistantImages(source, remaining);
      validateImageBudget([...attachments, ...galleryAttachments, ...picked]);
      setGalleryAttachments((current) => mergeUniqueAssistantAttachments(
        current,
        picked,
        new Set(attachments.map((attachment) => attachment.id)),
      ));
    } catch (error) {
      Alert.alert('相册不可用', error instanceof Error ? error.message : '读取相册图片失败');
    } finally { pickerLock.current = false; if (returnToMentions.current) { returnToMentions.current = false; setMentionSheetOpen(true); } }
  };
  const handleOpenPicker = async () => {
    Alert.alert('添加图片附件', '选择图片来源', [
      { text: '从相册选择', onPress: () => void addGalleryImages() },
      { text: '从文件选择', onPress: () => void addGalleryImages('file') },
      { text: '取消', style: 'cancel' },
    ]);
  };
  const composerAttachments = (() => {
    const current = [...attachments, ...galleryAttachments] as AttachmentLike[];
    if (!current.length) {
      attachmentNames.current.clear();
      nextAttachmentNumber.current = 1;
    }
    const named = assignImageDisplayNames(
      current,
      attachmentNames.current,
      nextAttachmentNumber.current,
    );
    nextAttachmentNumber.current = named.nextNumber;
    return named.attachments;
  })();
  // Depend on identities rather than image bytes or streamed assistant state.
  const composerSignature = composerAttachments.map(item => `${item.id}:${item.status}:${item.displayName}`).join('|');
  useEffect(() => {
    draftRevision.current++;
    onClientStateChange?.({ h3Composer: { text: draft, attachments: composerAttachments.filter(item => item.status === 'ready'), revision: draftRevision.current } });
  }, [draft, composerSignature, onClientStateChange]);
  const handleDraftChange = (value: string) => {
    const atomicRemoval = removeImageMentionOnBackspace(
      draft,
      value,
      inputSelection,
      rebuildImageMentions(draft, composerAttachments),
    );
    if (atomicRemoval) {
      setDraft(atomicRemoval.text);
      setInputSelection(atomicRemoval.selection);
      return;
    }
    setDraft(value);
  };
  const handleSelectMention = (attachment: AttachmentLike) => {
    const available = composerAttachments.find(
      (item) => item.id === attachment.id && item.status === 'ready',
    );
    if (!available) {
      setMentionSheetOpen(false);
      return;
    }
    const result = insertImageMention(
      draft,
      inputSelection,
      available,
      rebuildImageMentions(draft, composerAttachments),
    );
    setDraft(result.text);
    setInputSelection(result.selection);
    setMentionSheetOpen(false);
    inputRef.current?.focus();
  };
  const applySuggestion = useCallback((value: string) => {
    applyComposerSuggestion(value, setDraft, setInputSelection, inputRef);
  }, []);
  const history = (
    <HistoryList
      threads={threads}
      activeThreadId={activeThreadId}
      onSelect={(id) => {
        onSelectThread(id);
        setHistoryOpen(false);
      }}
      onNew={() => {
        onNewThread();
        setHistoryOpen(false);
      }}
      onDelete={onDeleteThread}
      onRename={onRenameThread}
      onSearchHistory={onSearchHistory}
      onLoadMoreHistory={onLoadMoreHistory}
    />
  );
  return (
    <KeyboardAvoidingView
      // Android adjustResize usually reports the keyboard-safe window height.
      // Residual padding covers edge-to-edge devices where it does not, while
      // remaining zero when the viewport was already resized.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={[
        styles.root,
        {
          paddingBottom: Math.max(insets.bottom, 8) + keyboardPadding,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="打开对话历史"
          onPress={() => setHistoryOpen(true)}
          style={styles.headerButton}
        >
          <AppIcon
            name="list_alt"
            size={20}
            color={LIGHT_PROMPT_COLORS.muted}
          />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.eyebrow}>PROMPT 助手</Text>
          <Text style={styles.title} numberOfLines={1}>
            {threads.find((item) => item.threadId === activeThreadId)
              ? sessionTitle(
                  threads.find((item) => item.threadId === activeThreadId)!,
                )
              : 'H3 创意工作台'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="新建对话"
          onPress={onNewThread}
          style={styles.headerButton}
        >
          <AppIcon name="add" size={22} color={LIGHT_PROMPT_COLORS.ink} />
        </Pressable>
      </View>
      <View style={styles.body}>
        {wide ? <View style={styles.sidebar}>{history}</View> : null}
        <View style={styles.conversation}>
          {notice ? (
            <View style={styles.notice}>
              <AppIcon name="info" size={16} color={LIGHT_PROMPT_COLORS.accent} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}
          <ConversationTimeline
            rows={rows}
            isRunning={isRunning || submitting}
            onExportPrompt={async (prompt, artifactId) => {
              if (!onExportHandoff) return onExportPrompt(prompt);
              const version = versions.find(item => item.artifactId === artifactId);
              if (version) onClientStateChange?.({ h3SelectedVersionId: version.id });
              setVersionsOpen(true);
            }}
            runIssue={runIssue?.runId && runs.some(run => run.id === runIssue.runId && run.error === runIssue.message) ? null : runIssue}
            runs={runs}
            completedMessageIds={completedMessageIds}
            latestVersionMessageId={versions.at(-1)?.sourceMessageId}
            onRetry={onRetry}
            onSelectSuggestion={applySuggestion}
          />
          <View style={styles.composerDock}>
            <View style={styles.composerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="补充创作信息" accessibilityState={{ expanded: briefOpen }} onPress={() => setBriefOpen(true)} style={({ pressed }) => [styles.composerAction, pressed && styles.composerActionPressed]}>
                <AppIcon name="filter_list" size={18} color={LIGHT_PROMPT_COLORS.muted} />
                <Text style={styles.composerActionText}>补充创作信息</Text>
                <AppIcon name="expand_more" size={16} color={LIGHT_PROMPT_COLORS.muted} />
              </Pressable>
              {versions.length ? <Pressable accessibilityRole="button" accessibilityLabel="打开 Prompt 版本" accessibilityState={{ expanded: versionsOpen }} onPress={() => setVersionsOpen(true)} style={({ pressed }) => [styles.composerAction, pressed && styles.composerActionPressed]}>
                <AppIcon name="list_alt" size={18} color={LIGHT_PROMPT_COLORS.muted} />
                <Text style={styles.composerActionText}>Prompt 版本</Text>
                <Text style={styles.versionCount}>{versions.length}</Text>
                <AppIcon name="expand_more" size={16} color={LIGHT_PROMPT_COLORS.muted} />
              </Pressable> : null}
            </View>
            <Composer
              value={draft}
              onChangeText={handleDraftChange}
              onSubmit={handleSubmit}
              onOpenPicker={handleOpenPicker}
              onOpenMentionPicker={() => setMentionSheetOpen(true)}
              onCancel={() => {
                agent.abortRun?.();
                onRunIssueChange({ kind: 'aborted', message: '已停止生成' });
              }}
              isRunning={isRunning || submitting}
              attachments={composerAttachments}
              inputRef={inputRef}
              selection={inputSelection}
              onSelectionChange={(event) =>
                setInputSelection(event.nativeEvent.selection)
              }
              onRemoveAttachment={(id) => {
                if (galleryAttachments.some((item) => item.id === id)) setGalleryAttachments((current) => current.filter((item) => item.id !== id));
                else removeAttachment(id);
              }}
            />
          </View>
        </View>
      </View>
      {!wide ? (
        <DraggableBottomSheet
          visible={historyOpen}
          title="对话历史"
          onClose={() => setHistoryOpen(false)}
        >
          {history}
        </DraggableBottomSheet>
      ) : null}
      <ImageMentionSheet
        visible={mentionSheetOpen}
        attachments={composerAttachments}
        onClose={() => setMentionSheetOpen(false)}
        onSelect={handleSelectMention}
        onAdd={() => {
          returnToMentions.current = true;
          setMentionSheetOpen(false);
          void handleOpenPicker();
        }}
      />
      <DraggableBottomSheet ref={versionSheet} visible={versionsOpen} title="Prompt 版本" onClose={() => setVersionsOpen(false)}>
          {versionsOpen && !workflowDefinition ? <View style={{ gap: 12 }}><Text accessibilityRole={workflowLoadIssue ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.noticeText}>{workflowLoadIssue ?? '正在加载工作流…'}</Text>{workflowLoadIssue && onReloadWorkflow ? <Pressable accessibilityRole="button" accessibilityLabel="重新加载工作流" onPress={onReloadWorkflow} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>重新加载工作流</Text></Pressable> : null}</View> : null}
          {versionsOpen && workflowDefinition ? <PromptVersionPanel workflowDefinition={workflowDefinition} inSheet onExpand={() => versionSheet.current?.expand()} versions={versions} selectedVersionId={typeof state.h3SelectedVersionId === 'string' ? state.h3SelectedVersionId : undefined} threadId={activeThreadId} onSelect={id => onClientStateChange?.({ h3SelectedVersionId: id })} onRestore={(id, commandId) => {
            const next = restorePromptVersion(versions, id, Date.now(), commandId);
            onClientStateChange?.({ h3Versions: next, h3SelectedVersionId: next[next.length - 1]?.id });
          }} onExport={async handoff => { if (onExportHandoff) await onExportHandoff(handoff); else await onExportPrompt(handoff.prompt); setVersionsOpen(false); }} /> : null}
      </DraggableBottomSheet>
      <DraggableBottomSheet ref={briefSheet} visible={briefOpen} title="补充创作信息" onClose={() => setBriefOpen(false)} footer={
          <Pressable accessibilityRole="button" accessibilityLabel="加入创作草稿" style={briefStyles.submit} onPress={() => {
            const labels = { subject: '主体与动作', camera: '镜头与运动', style: '风格与氛围', duration: '期望时长' };
            const extra = (Object.keys(brief) as Array<keyof typeof brief>).filter(key => brief[key].trim()).map(key => `${labels[key]}：${brief[key].trim()}`).join('\n');
            if (!extra) return;
            applySuggestion([draft.trim(), extra].filter(Boolean).join('\n'));
            setBriefOpen(false);
          }}><Text style={briefStyles.submitText}>加入草稿</Text></Pressable>
      }>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={briefStyles.fields}>
          <Text style={briefStyles.hint}>填写已确定的内容，其余可以和助手继续讨论。</Text>
          {([['subject', '主体与动作', '谁在做什么，例如：一位少女穿过雨巷'], ['camera', '镜头与运动', '例如：近景起镜，缓慢后拉'], ['style', '风格与氛围', '例如：电影感、暖色、安静'], ['duration', '期望时长', '例如：8 秒']] as const).map(([key, label, placeholder]) => <View key={key} style={{ gap: 6 }}>
            <Text style={briefStyles.label}>{label}</Text>
            <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={LIGHT_PROMPT_COLORS.muted} value={brief[key]} onFocus={() => briefSheet.current?.expand()} onChangeText={value => setBrief(current => ({ ...current, [key]: value }))} style={briefStyles.input} />
          </View>)}
        </ScrollView>
      </DraggableBottomSheet>
    </KeyboardAvoidingView>
  );
}

export function getKeyboardAvoidancePadding(
  viewportHeight: number,
  keyboardHeight: number,
  baselineViewportHeight: number,
  hiddenBottomBarHeight = 0,
): number {
  const viewportResize = Math.max(baselineViewportHeight - viewportHeight, 0);
  return Math.max(keyboardHeight - viewportResize - hiddenBottomBarHeight, 0);
}

export function ConversationTimeline({
  rows,
  isRunning,
  onExportPrompt,
  runIssue = null,
  onRetry = async () => undefined,
  onSelectSuggestion = () => undefined,
  completedMessageIds = [],
  runs = [],
  latestVersionMessageId,
}: {
  rows: ReturnType<typeof normalizeMessages>;
  isRunning: boolean;
  onExportPrompt: (prompt: string, artifactId?: string) => Promise<void>;
  runIssue?: RunIssue | null;
  onRetry?: (runId?: string) => Promise<void>;
  onSelectSuggestion?: (suggestion: string) => void;
  completedMessageIds?: readonly string[];
  runs?: PromptRun[];
  latestVersionMessageId?: string;
}) {
  const listRef = useRef<FlatList<ReturnType<typeof projectRunTimeline>[number]>>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const allRows = useMemo(() => {
    const runToolIds = new Set(runs.flatMap(run => run.tools.map(tool => tool.id)));
    return projectRunTimeline(rows, runs, completedMessageIds).map(row => row.kind === 'assistant' && row.tools.some(tool => runToolIds.has(tool.id))
      ? { ...row, tools: row.tools.filter(tool => !runToolIds.has(tool.id)) } : row).filter(row => row.kind !== 'assistant'
      || (completedMessageIds.includes(row.id) ? row.prose ?? row.text : row.text).trim()
      || (row.candidates ?? (row.prompt ? [row.prompt] : [])).length > 0
      || row.tools.length > 0);
  }, [rows, runs, completedMessageIds]);
  const timelineRows = allRows.slice(-visibleCount);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const exportRef = useRef(onExportPrompt); exportRef.current = onExportPrompt;
  const exportPrompt = useCallback((prompt: string, artifactId?: string) => exportRef.current(prompt, artifactId), []);
  const [followingLatest, setFollowingLatest] = useState(true);
  const followingLatestRef = useRef(true);
  const setFollow = useCallback((value: boolean) => { followingLatestRef.current = value; setFollowingLatest(value); }, []);
  const inspectProcess = useCallback(() => setFollow(false), [setFollow]);
  const scrollToLatest = useCallback((animated = !isRunning) => {
    if (followingLatestRef.current) listRef.current?.scrollToEnd({ animated });
  }, [isRunning]);
  useEffect(() => {
    scrollToLatest();
  }, [isRunning, scrollToLatest, rows.length]);
  const updateFollow = useCallback((type: 'scroll' | 'scroll-end', metrics: TimelineMetrics) => {
    setFollow(nextFollowState(followingLatestRef.current, { type, metrics }));
  }, [setFollow]);
  return (
      <View style={{ flex: 1 }}>
        <FlatList
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListHeaderComponent={allRows.length > visibleCount ? <Pressable accessibilityRole="button" accessibilityLabel="加载更早消息" style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }} onPress={() => { setFollow(false); setVisibleCount(count => count + 50); }}><Text>加载更早消息</Text></Pressable> : null}
          ref={listRef}
          data={timelineRows}
          keyExtractor={(item) => item.id}
          style={styles.timeline}
          contentContainerStyle={styles.timelineContent}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScrollBeginDrag={() =>
            { Keyboard.dismiss(); setFollow(nextFollowState(followingLatestRef.current, { type: 'drag-start' })); }
          }
          onScroll={({ nativeEvent }) => updateFollow('scroll', nativeEvent)}
          onMomentumScrollEnd={({ nativeEvent }) =>
            updateFollow('scroll-end', nativeEvent)
          }
          onScrollEndDrag={({ nativeEvent }) =>
            updateFollow('scroll-end', nativeEvent)
          }
          onContentSizeChange={() => scrollToLatest()}
          onLayout={() => scrollToLatest()}
          ListEmptyComponent={
            isRunning ? (
              <RunningIndicator />
            ) : (
              <EmptyTimeline onSelectSuggestion={onSelectSuggestion} />
            )
          }
          ListFooterComponent={
            runIssue ? <RunIssueRow issue={runIssue} onRetry={onRetry} /> : !runs.length && allRows.length > 0 && isRunning ? (
              <RunningIndicator compact />
            ) : null
          }
          renderItem={({ item }) =>
        item.kind === 'run' ? <RunTimelineRow run={item.run} entries={item.entries} disabled={isRunning} onRetry={onRetry} onInspect={inspectProcess} /> : <TimelineMessageRow
          item={item}
          completed={completedMessageIds.includes(item.id)}
          streaming={isRunning && (runs.length ? runs.some(run => run.status === 'running' && run.messageIds.at(-1) === item.id) : item.id === rows.at(-1)?.id)}
          ready={!isRunning && completedMessageIds.includes(item.id)}
          latest={latestVersionMessageId ? item.id === latestVersionMessageId : undefined}
          showTools={item.kind === 'assistant'}
          onPreview={setPreviewImage}
          onExportPrompt={exportPrompt}
        />
          }
        />
        {!followingLatest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="回到最新消息"
            onPress={() => {
              setFollow(nextFollowState(followingLatestRef.current, { type: 'back-to-latest' }));
              listRef.current?.scrollToEnd({ animated: true });
            }}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 12,
              flexDirection: 'row',
              gap: 4,
              padding: 10,
              borderRadius: 18,
              backgroundColor: LIGHT_PROMPT_COLORS.surface,
            }}
          >
            <AppIcon name="download" size={16} color={LIGHT_PROMPT_COLORS.ink} />
            <Text>回到最新</Text>
          </Pressable>
        ) : null}
        <ReferenceImagePreview uri={previewImage} onClose={() => setPreviewImage(null)} />
      </View>
  );
}

const TimelineMessageRow = React.memo(function TimelineMessageRow({ item, completed, streaming, ready, latest, showTools, onPreview, onExportPrompt }: {
  item: PresentationMessage; completed: boolean; streaming: boolean; ready: boolean; latest?: boolean; showTools: boolean;
  onPreview: (uri: string) => void;
  onExportPrompt: (prompt: string, artifactId?: string) => Promise<void>;
}) {
  return item.kind === 'user' ? (
          <View style={styles.userRow}>
            {item.attachments.length ? (
              <ScrollView
                horizontal
                contentContainerStyle={sentStyles.sentAttachments}
              >
                {item.attachments.map((attachment, index) => (
                  <Pressable accessibilityRole="button" accessibilityLabel={`查看参考图片 ${item.id} ${attachment.displayName ?? `图片${index + 1}`}`} key={`${attachment.uri}-${index}`} onPress={() => onPreview(attachment.uri)}><Image
                    key={`${attachment.uri}-${index}`}
                    source={{ uri: attachment.uri }}
                    style={sentStyles.sentAttachment}
                  /></Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.userBubble}>
              <UserMessageText
                text={item.text || '（已添加参考图）'}
                attachments={item.attachments}
                onPreview={onPreview}
              />
            </View>
          </View>
        ) : (
          <View style={styles.assistantRow}>
            <View style={styles.assistantMark}>
              <AppIcon
                name="smart_toy"
                size={16}
                color={LIGHT_PROMPT_COLORS.ink}
              />
            </View>
            <View style={styles.assistantContent}>
              {(completed ? item.prose ?? item.text : item.text).trim() ? (
                <>
                  <CopilotMarkdown
                    content={completed ? item.prose ?? item.text : item.text}
                    streamingAnimation={streaming}
                    style={markdownStyles}
                  />
                  <ResponseCopyButton id={item.id} text={item.text} />
                </>
              ) : null}
              {showTools && item.tools.length ? <ToolTimeline steps={item.tools} /> : null}
              {(item.candidates ?? (item.prompt ? [item.prompt] : [])).map(candidate => (
                <PromptResultCard
                  key={'id' in candidate ? candidate.id as string : item.id}
                  result={candidate}
                  ready={ready}
                  latest={latest}
                  onExport={prompt => onExportPrompt(prompt, 'id' in candidate ? candidate.id as string : undefined)}
                />
              ))}
            </View>
          </View>
        );
}, (previous, next) => {
  if (previous.completed !== next.completed || previous.streaming !== next.streaming || previous.ready !== next.ready || previous.latest !== next.latest || previous.showTools !== next.showTools || previous.onPreview !== next.onPreview || previous.onExportPrompt !== next.onExportPrompt) return false;
  const a = previous.item, b = next.item;
  if (a === b) return true;
  if (a.id !== b.id || a.kind !== b.kind || a.text !== b.text) return false;
  if (a.kind === 'user' && b.kind === 'user') return a.attachments === b.attachments;
  if (a.kind === 'assistant' && b.kind === 'assistant') return a.prose === b.prose && a.prompt === b.prompt && a.candidates === b.candidates && a.tools.length === b.tools.length && a.tools.every((tool, index) => {
    const other = b.tools[index];
    return tool.id === other.id && tool.name === other.name && tool.status === other.status && tool.summary === other.summary;
  });
  return false;
});

const briefStyles = StyleSheet.create({
  fields: { gap: 16, paddingTop: 8, paddingBottom: 20 },
  hint: { fontSize: 13, lineHeight: 20, color: LIGHT_PROMPT_COLORS.muted },
  label: { fontSize: 13, fontWeight: '600', color: LIGHT_PROMPT_COLORS.ink },
  input: { minHeight: 48, borderWidth: 1, borderColor: LIGHT_PROMPT_COLORS.line, backgroundColor: LIGHT_PROMPT_COLORS.surface, color: LIGHT_PROMPT_COLORS.ink, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  submit: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: LIGHT_PROMPT_COLORS.ink },
  submitText: { color: LIGHT_PROMPT_COLORS.surface, fontSize: 15, fontWeight: '600' },
});

function RunIssueRow({
  issue,
  onRetry,
}: {
  issue: RunIssue;
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <View accessibilityRole="alert" style={styles.runIssue}>
      <Text style={styles.runIssueText}>{issue.message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重试上一轮"
        accessibilityState={{ disabled: retrying }}
        disabled={retrying}
        onPress={() => void handleRetry()}
        style={styles.runIssueAction}
      >
        <Text style={styles.runIssueActionText}>
          {retrying ? '正在重试…' : '重试'}
        </Text>
      </Pressable>
    </View>
  );
}

const CAPABILITY_EXAMPLES: Record<string, string> = {
  'h3-prompt-writing': '一镜到底的城市夜跑',
  'papercraft-stop-motion-explainer': '纸艺风格的产品广告',
  'minimalist-product-ad-generator': '极简风格的香水广告',
  '3d-animation-short-generator': '温暖的 3D 动画短片',
};
const EMPTY_SUGGESTIONS = Object.keys(officialH3SkillManifest)
  .filter(path => path.endsWith('/SKILL.md'))
  .map(path => CAPABILITY_EXAMPLES[path.split('/')[2]])
  .filter((example): example is string => Boolean(example));

function EmptyTimeline({
  onSelectSuggestion,
}: {
  onSelectSuggestion: (suggestion: string) => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyMark}>
        <AppIcon
          name="auto_awesome"
          size={24}
          color={LIGHT_PROMPT_COLORS.ink}
        />
      </View>
      <Text style={styles.emptyTitle}>
        把一个想法，变成可执行的 H3 Prompt
      </Text>
      <Text style={styles.emptySubtitle}>
        描述主体、动作、镜头和氛围；我会帮你补全细节。
      </Text>
      <View style={styles.suggestions}>
        {EMPTY_SUGGESTIONS.map((suggestion) => (
          <Pressable
            key={suggestion}
            accessibilityRole="button"
            accessibilityLabel={`使用建议 ${suggestion}`}
            onPress={() => onSelectSuggestion(suggestion)}
            style={styles.suggestion}
          >
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RunningIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.runningIndicator, compact && styles.runningIndicatorCompact]}>
      <View style={styles.runningDot} />
      <Text style={styles.runningText}>正在生成 Prompt…</Text>
    </View>
  );
}

export function ToolTimeline({ steps }: { steps: ToolTimelineStep[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.toolTimeline}>
      <Pressable
        accessibilityLabel={expanded ? '收起处理过程' : '展开处理过程'}
        onPress={() => setExpanded((value) => !value)}
        style={styles.toolSummary}
      >
        <Text style={styles.toolChevron}>{expanded ? '⌄' : '›'}</Text>
        <Text style={styles.toolSummaryText}>{toolTimelineSummary(steps)}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.toolSteps}>
          {steps.map((step, index) => (
            <View key={step.id} style={styles.toolStep}>
              <View
                style={[
                  styles.stepDot,
                  step.status === 'failed' && styles.stepDotFailed,
                ]}
              />
              <Text style={styles.stepName}>
                {index + 1}. {step.name}
              </Text>
              <Text style={styles.stepStatus}>
                {step.status === 'running'
                  ? '进行中'
                  : step.status === 'failed'
                    ? '失败'
                    : '完成'}
              </Text>
              {step.summary ? (
                <Text style={styles.stepSummary}>{step.summary}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function useClipboardFeedback(text: string) {
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    generation.current++;
    setStatus('');
    return () => { generation.current++; clearTimeout(timer.current); };
  }, [text]);
  const copy = async () => {
    const request = ++generation.current;
    clearTimeout(timer.current);
    let feedback = '已复制';
    try { if (await Clipboard.setStringAsync(text) === false) feedback = '复制失败，请重试'; }
    catch { feedback = '复制失败，请重试'; }
    if (generation.current !== request) return;
    setStatus(feedback);
    timer.current = setTimeout(() => { if (generation.current === request) setStatus(''); }, 1600);
  };
  return { status, copy };
}

function ResponseCopyButton({ id, text }: { id: string; text: string }) {
  const { status, copy } = useClipboardFeedback(text);
  return <Pressable accessibilityRole="button" accessibilityLabel={`复制回答 ${id}`} onPress={() => void copy()} style={styles.assistantCopy}>
    <AppIcon name="content_copy" size={14} color={LIGHT_PROMPT_COLORS.muted} />
    <Text accessibilityLiveRegion="polite" style={styles.assistantCopyText}>{status || '复制'}</Text>
  </Pressable>;
}

export function PromptResultCard({
  result,
  onExport,
  ready = false,
  latest,
}: {
  result: PromptParseResult;
  onExport: (prompt: string) => Promise<void>;
  ready?: boolean;
  latest?: boolean;
}) {
  const { status: copyStatus, copy } = useClipboardFeedback(result.promptText);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const exportLock = useRef(false);
  const exportPrompt = async () => {
    if (!ready || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try { await onExport(result.promptText); }
    catch (error) { Alert.alert('导出失败', error instanceof Error ? error.message : '无法保存 Prompt，请重试'); }
    finally { exportLock.current = false; setExporting(false); }
  };
  return (
    <View style={styles.promptCard}>
      <View style={styles.promptCardHeader}>
        <View>
          <Text style={styles.promptCardEyebrow}>{ready ? 'FINAL H3 PROMPT' : 'H3 PROMPT 草稿'}</Text>
          <Text style={styles.promptCardTitle}>{ready ? `${latest === undefined ? '' : latest ? '最新版本 · ' : '历史版本 · '}已完成，可导出` : '尚未确认生成完成，可复制保留'}</Text>
        </View>
        <AppIcon
          name="auto_awesome"
          size={18}
          color={LIGHT_PROMPT_COLORS.muted}
        />
      </View>
      <Text selectable numberOfLines={expanded ? undefined : 5} style={styles.promptText}>
        {result.promptText}
      </Text>
      <Pressable accessibilityLabel={expanded ? '收起卡片 Prompt' : '展开卡片 Prompt'} onPress={() => setExpanded(value => !value)}><Text style={styles.secondaryActionText}>{expanded ? '收起' : '展开全文'}</Text></Pressable>
      <View style={styles.promptActions}>
        <Pressable
          accessibilityLabel="复制 Prompt"
          onPress={() => void copy()}
          style={styles.secondaryAction}
        >
          <AppIcon
            name="content_copy"
            size={16}
            color={LIGHT_PROMPT_COLORS.ink}
          />
          <Text accessibilityLiveRegion="polite" style={styles.secondaryActionText}>
            {copyStatus || '复制 Prompt'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="导出 Prompt 到生成"
          accessibilityState={{ disabled: !ready || exporting }}
          disabled={!ready || exporting}
          onPress={() => void exportPrompt()}
          style={[styles.primaryAction, (!ready || exporting) && { opacity: 0.45 }]}
        >
          <Text style={styles.primaryActionText}>{exporting ? '正在导出…' : '导出到生成'}</Text>
          <Text style={styles.primaryActionArrow}>↗</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ImageMentionSheet({
  visible,
  attachments,
  onClose,
  onSelect,
  onAdd,
}: {
  visible: boolean;
  attachments: AttachmentLike[];
  onClose: () => void;
  onSelect: (attachment: AttachmentLike) => void;
  onAdd: () => void;
}) {
  const ready = attachments.filter((attachment) => attachment.status === 'ready');
  return (
    <DraggableBottomSheet visible={visible} title="引用图片附件" onClose={onClose}>
          {ready.length ? (
            <ScrollView
              style={styles.mentionList}
              keyboardShouldPersistTaps="handled"
            >
              {ready.map((attachment) => (
                <Pressable
                  key={attachment.id}
                  accessibilityLabel={`引用图片附件 ${attachment.displayName || '图片'}`}
                  onPress={() => onSelect(attachment)}
                  style={styles.mentionRow}
                >
                  {attachment.source ? (
                    <Image
                      source={{ uri: getSourceUrl(attachment.source as never) }}
                      style={styles.mentionImage}
                    />
                  ) : (
                    <View style={styles.mentionImagePlaceholder}>
                      <Text style={styles.loadingText}>图片</Text>
                    </View>
                  )}
                  <Text style={styles.mentionName} numberOfLines={1}>
                    {attachment.displayName || '图片'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.mentionEmpty}>
              <Text style={styles.mentionEmptyText}>先上传图片附件</Text>
              <Pressable
                accessibilityLabel="上传图片附件"
                onPress={onAdd}
                style={styles.mentionAddButton}
              >
                <AppIcon name="add_photo_alternate" size={18} color={LIGHT_PROMPT_COLORS.ink} />
                <Text style={styles.mentionAddText}>上传图片</Text>
              </Pressable>
            </View>
          )}
    </DraggableBottomSheet>
  );
}

export function AttachmentStrip({
  attachments,
  onOpenPicker,
  onRemoveAttachment,
}: {
  attachments: AttachmentLike[];
  onOpenPicker: () => Promise<void>;
  onRemoveAttachment?: (id: string) => void;
}) {
  const [preview, setPreview] = useState<AttachmentLike | null>(null);
  if (!attachments.length) return null;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.attachments}
      >
        {attachments.map((attachment) => (
          <View key={attachment.id} style={styles.attachment}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看附件 ${attachment.displayName || '图片'}`}
              accessibilityState={{ disabled: attachment.status !== 'ready' }}
              disabled={attachment.status !== 'ready'}
              onPress={() =>
                attachment.status === 'ready'
                  ? setPreview(attachment)
                  : undefined
              }
            >
              {attachment.source?.value ? (
                <Image
                  source={{ uri: getSourceUrl(attachment.source as never) }}
                  style={styles.attachmentImage}
                />
              ) : (
                <View style={styles.attachmentLoading}>
                  <Text style={styles.loadingText}>上传中</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`移除附件 ${attachment.displayName || '图片'}`}
              onPress={() => onRemoveAttachment?.(attachment.id)}
              style={styles.removeAttachment}
            >
              <View style={styles.removeAttachmentBadge}>
                <AppIcon name="close" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <ReferenceImagePreview uri={preview?.source ? getSourceUrl(preview.source as never) || null : null} onClose={() => setPreview(null)} />
    </>
  );
}

export function ReferenceImagePreview({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const closeRef = useRef<View>(null);
  return <Modal visible={uri !== null} transparent animationType="none" onRequestClose={onClose} onShow={() => { const target = findNodeHandle(closeRef.current); if (target) AccessibilityInfo.setAccessibilityFocus(target); }}>
    <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{ flex: 1, backgroundColor: COLORS.mediaBackground, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 16 }}>
      <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel="关闭图片预览" onPress={onClose} style={{ width: 48, height: 48, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center' }}><AppIcon name="close" size={24} color={COLORS.onPrimary} /></Pressable>
      {uri ? <Image testID="reference-image-preview" accessibilityLabel="参考图片" source={{ uri }} resizeMode="contain" style={{ flex: 1, width: '100%' }} /> : null}
    </View>
  </Modal>;
}

export function Composer({
  value,
  onChangeText,
  onSubmit,
  onOpenPicker,
  onOpenMentionPicker,
  onCancel,
  isRunning,
  attachments,
  onRemoveAttachment,
  inputRef,
  selection,
  onSelectionChange,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: (value: string) => void;
  onOpenPicker: () => Promise<void>;
  onOpenMentionPicker?: () => void;
  onCancel: () => void;
  isRunning: boolean;
  attachments: AttachmentLike[];
  onRemoveAttachment?: (id: string) => void;
  inputRef?: React.RefObject<TextInput | null>;
  selection?: { start: number; end: number };
  onSelectionChange?: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void;
}) {
  const uploading = attachments.some((item) => item.status === 'uploading');
  const disabled =
    uploading ||
    (!value.trim() && !attachments.some((item) => item.status === 'ready'));
  return (
    <View style={styles.composer}>
      <AttachmentStrip
        attachments={attachments}
        onOpenPicker={onOpenPicker}
        onRemoveAttachment={onRemoveAttachment}
      />
      <View testID="composer-input-area" style={styles.inputArea}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder="描述你想生成的画面…"
          placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
          multiline
          maxLength={4000}
          style={styles.input}
          editable
          scrollEnabled
          textAlignVertical="top"
          selection={selection}
          onSelectionChange={onSelectionChange}
          onSubmitEditing={() => {
            if (!disabled) onSubmit(value);
          }}
        />
      </View>
      <View style={styles.composerRow}>
        <Pressable
          accessibilityLabel="添加图片附件"
          onPress={() => void onOpenPicker()}
          style={styles.addButton}
        >
          <AppIcon
            name="add_photo_alternate"
            size={19}
            color={LIGHT_PROMPT_COLORS.ink}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="引用图片附件"
          onPress={onOpenMentionPicker}
          style={styles.addButton}
        >
          <AppIcon
            name="alternate_email"
            size={19}
            color={LIGHT_PROMPT_COLORS.ink}
          />
        </Pressable>
        <View testID="composer-toolbar-spacer" style={styles.toolbarSpacer} />
        <Pressable
          accessibilityLabel={isRunning ? '停止生成' : '发送消息'}
          accessibilityState={{ disabled: !isRunning && disabled }}
          disabled={!isRunning && disabled}
          onPress={() => (isRunning ? onCancel() : onSubmit(value))}
          style={[
            styles.sendButton,
            !isRunning && disabled && styles.sendDisabled,
          ]}
        >
          <AppIcon
            name={isRunning ? 'close' : 'send'}
            size={18}
            color={
              isRunning || !disabled ? '#FFFFFF' : LIGHT_PROMPT_COLORS.muted
            }
          />
        </Pressable>
      </View>
    </View>
  );
}

function UserMessageText({
  text,
  attachments,
  onPreview,
}: {
  text: string;
  attachments: Array<{ uri: string; filename?: string; displayName?: string }>;
  onPreview?: (uri: string) => void;
}) {
  if (!attachments.length) {
    return <Text testID="user-message-text" selectable style={styles.userText}>{text}</Text>;
  }
  const parts: React.ReactNode[] = [];
  const labels = attachments.map((attachment, index) => ({
    label: `@${attachment.displayName ?? `图片${index + 1}`}`,
    attachment,
  }));
  let cursor = 0;
  while (cursor < text.length) {
    const match = labels
      .map((item) => ({ ...item, start: text.indexOf(item.label, cursor) }))
      .filter((item) => item.start >= 0)
      .sort((left, right) => left.start - right.start || right.label.length - left.label.length)[0];
    if (!match) {
      parts.push(<Text key={`text-${cursor}`}>{text.slice(cursor)}</Text>);
      break;
    }
    if (match.start > cursor) parts.push(<Text key={`text-${cursor}`}>{text.slice(cursor, match.start)}</Text>);
    parts.push(
      <Text key={`mention-${match.start}`} testID="user-image-mention" style={styles.userMention} onPress={() => onPreview?.(match.attachment.uri)}>
        <Image testID="user-image-mention-thumbnail" source={{ uri: match.attachment.uri }} style={styles.userMentionImage} />
        {match.label}
      </Text>,
    );
    cursor = match.start + match.label.length;
  }
  return <Text testID="user-message-text" selectable style={styles.userText}>{parts}</Text>;
}

function HistoryList({
  threads,
  activeThreadId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearchHistory,
  onLoadMoreHistory,
}: HistoryProps) {
  const [query, setQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<LocalThreadSnapshot | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState('');
  const search = useRef(onSearchHistory); search.current = onSearchHistory;
  useEffect(() => { if (!search.current) return; const timer = setTimeout(() => search.current?.(query), 250); return () => clearTimeout(timer); }, [query]);
  const groups = groupSessions(
    onSearchHistory ? threads : threads.filter((thread) => matchesSessionQuery(thread, query)),
    Date.now(),
  );
  const sections = groups.map((group) => ({ title: group.label, data: group.snapshots }));
  return (
    <View style={styles.history}>
      <View style={styles.historySearch}>
        <AppIcon name="search" size={18} color={LIGHT_PROMPT_COLORS.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索对话"
          placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
          style={styles.searchInput}
        />
      </View>
      <Pressable
        accessibilityLabel="历史中新建对话"
        onPress={onNew}
        style={styles.newHistory}
      >
        <AppIcon name="add" size={18} color={LIGHT_PROMPT_COLORS.ink} />
        <Text style={styles.newHistoryText}>新对话</Text>
      </Pressable>
      <SectionList
        sections={sections}
        style={styles.historyList}
        onEndReached={onLoadMoreHistory}
        keyExtractor={(thread) => thread.threadId}
        renderSectionHeader={({ section }) => <Text style={styles.groupLabel}>{section.title}</Text>}
        renderItem={({ item: thread }) => (
          <Pressable
            onPress={() => onSelect(thread.threadId)}
            style={[styles.historyItem, thread.threadId === activeThreadId && styles.historyItemActive]}
          >
            <View style={styles.historyItemMain}>
              <Text numberOfLines={1} style={styles.historyTitle}>{sessionDisplayTitle(thread, threads)}</Text>
              <Text style={styles.historyMeta}>{sessionMessageCount(thread)} 条消息 · {sessionRunLabel(thread.state) || new Date(thread.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Pressable accessibilityLabel={`管理会话 ${thread.threadId}`} onPress={() => { setRenameTarget(thread); setRenameValue(sessionTitle(thread)); }}>
              <Text style={styles.more}>•••</Text>
            </Pressable>
            <Pressable accessibilityLabel={`删除会话 ${thread.threadId}`} onPress={() => Alert.alert('删除会话', '删除后无法恢复本机会话记录。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: () => onDelete(thread.threadId) }])}>
              <AppIcon name="delete" size={17} color={LIGHT_PROMPT_COLORS.muted} />
            </Pressable>
          </Pressable>
        )}
      />
      <Modal
        visible={Boolean(renameTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.renameKeyboardSurface}
        >
          <View style={styles.renameBackdrop}>
            <View style={styles.renameCard}>
              <Text style={styles.renameTitle}>重命名会话</Text>
              <TextInput
                autoFocus
                value={renameValue}
                onChangeText={setRenameValue}
                style={styles.renameInput}
                placeholder="输入会话名称"
                placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
              />
              <View style={styles.renameActions}>
                <Pressable
                  onPress={() => setRenameTarget(null)}
                  style={styles.renameCancel}
                >
                  <Text style={styles.renameCancelText}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (renameTarget && renameValue.trim())
                      onRename(renameTarget.threadId, renameValue.trim());
                    setRenameTarget(null);
                  }}
                  style={styles.renameConfirm}
                >
                  <Text style={styles.renameConfirmText}>保存</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const sentStyles = {
  sentAttachments: { gap: 7, marginBottom: 7 },
  sentAttachment: { width: 54, height: 54, borderRadius: 11 },
};

const markdownStyles = {
  paragraph: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 2,
    marginBottom: 7,
  },
  h1: { color: LIGHT_PROMPT_COLORS.ink },
  h2: { color: LIGHT_PROMPT_COLORS.ink },
  h3: { color: LIGHT_PROMPT_COLORS.ink },
  codeBlock: {
    backgroundColor: '#F0EFEA',
    borderRadius: 12,
    padding: 12,
    color: LIGHT_PROMPT_COLORS.ink,
  },
  code: { backgroundColor: '#F0EFEA', color: LIGHT_PROMPT_COLORS.ink },
};
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LIGHT_PROMPT_COLORS.background },
  header: {
    minHeight: 62,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LIGHT_PROMPT_COLORS.line,
    backgroundColor: LIGHT_PROMPT_COLORS.background,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
  },
  headerTitleWrap: { flex: 1, paddingHorizontal: 10 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.3,
    color: LIGHT_PROMPT_COLORS.muted,
    fontWeight: '700',
  },
  title: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '700',
    color: LIGHT_PROMPT_COLORS.ink,
  },
  body: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 264,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: LIGHT_PROMPT_COLORS.line,
    padding: 14,
  },
  conversation: { flex: 1, maxWidth: 820, alignSelf: 'center', width: '100%' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#FFF4D6',
  },
  noticeText: { flex: 1, color: '#8A5A00', fontSize: 12, lineHeight: 17 },
  timeline: { flex: 1 },
  timelineContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 18 },
  runningIndicator: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
  },
  runningIndicatorCompact: { alignSelf: 'flex-start', marginTop: 8, marginBottom: 8 },
  runIssue: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5C4BC',
    backgroundColor: '#FFF4F1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  runIssueText: {
    flex: 1,
    color: '#8B3528',
    fontSize: 13,
    lineHeight: 18,
  },
  runIssueAction: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3D9D2',
  },
  runIssueActionText: { color: '#743026', fontSize: 12, fontWeight: '700' },
  runningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LIGHT_PROMPT_COLORS.accent,
  },
  runningText: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 70 },
  emptyMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    color: LIGHT_PROMPT_COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  suggestions: { width: '100%', marginTop: 26, gap: 10 },
  suggestion: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
    overflow: 'hidden',
  },
  suggestionText: { color: LIGHT_PROMPT_COLORS.ink, fontSize: 14 },
  userRow: { alignItems: 'flex-end', marginVertical: 8 },
  userBubble: {
    maxWidth: '84%',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    backgroundColor: '#ECEBE6',
  },
  userText: { color: LIGHT_PROMPT_COLORS.ink, fontSize: 15, lineHeight: 22 },
  userMention: {
    paddingHorizontal: 3,
    borderRadius: 6,
    backgroundColor: '#E9E7E1',
    color: LIGHT_PROMPT_COLORS.ink,
    fontWeight: '600',
  },
  userMentionImage: { width: 18, height: 18, borderRadius: 4 },
  assistantRow: { flexDirection: 'row', gap: 9, marginVertical: 10 },
  assistantMark: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantContent: { flex: 1, minWidth: 0 },
  assistantCopy: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 8,
    marginTop: 2,
    borderRadius: 10,
  },
  assistantCopyText: {
    color: LIGHT_PROMPT_COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  toolTimeline: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: LIGHT_PROMPT_COLORS.line,
  },
  toolSummary: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolChevron: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 20 },
  toolSummaryText: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 12 },
  toolSteps: { paddingBottom: 8 },
  toolStep: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#68856D' },
  stepDotFailed: { backgroundColor: '#B35E53' },
  stepName: { color: LIGHT_PROMPT_COLORS.ink, fontSize: 12, flex: 1 },
  stepStatus: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 11 },
  stepSummary: {
    width: '100%',
    paddingLeft: 13,
    color: LIGHT_PROMPT_COLORS.muted,
    fontSize: 11,
  },
  promptCard: {
    marginTop: 12,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LIGHT_PROMPT_COLORS.line,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
  },
  promptCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  promptCardEyebrow: {
    color: LIGHT_PROMPT_COLORS.muted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  promptCardTitle: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  promptText: {
    marginTop: 13,
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  promptActions: { flexDirection: 'row', gap: 8, marginTop: 15 },
  secondaryAction: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT_PROMPT_COLORS.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  primaryActionArrow: { color: '#FFFFFF', fontSize: 16 },
  composerDock: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 7 },
  composerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  composerAction: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: LIGHT_PROMPT_COLORS.line, backgroundColor: LIGHT_PROMPT_COLORS.surface },
  composerActionPressed: { backgroundColor: COLORS.primarySoft },
  composerActionText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: LIGHT_PROMPT_COLORS.ink },
  versionCount: { minWidth: 20, textAlign: 'center', paddingHorizontal: 5, borderRadius: 5, backgroundColor: COLORS.primarySoft, color: COLORS.primary, fontSize: 12, lineHeight: 20, fontWeight: '700' },
  composer: {
    padding: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: LIGHT_PROMPT_COLORS.line,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
  },
  composerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  inputArea: {
    minHeight: 44,
    maxHeight: 120,
    position: 'relative',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbarSpacer: { flex: 1 },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#F0EFEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    maxHeight: 120,
    minHeight: 36,
    paddingTop: 8,
    paddingBottom: 7,
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#ECEBE6' },
  attachments: { paddingHorizontal: 2, paddingBottom: 8, gap: 8 },
  attachment: { width: 72, height: 72, paddingTop: 8, paddingRight: 8 },
  attachmentImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#ECEBE6',
  },
  attachmentLoading: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#ECEBE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 9 },
  removeAttachment: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  removeAttachmentBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: LIGHT_PROMPT_COLORS.surface,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '92%', height: '78%' },
  history: { flex: 1 },
  historySearch: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
  },
  searchInput: {
    flex: 1,
    marginLeft: 7,
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 13,
  },
  newHistory: {
    minHeight: 40,
    marginTop: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: LIGHT_PROMPT_COLORS.line,
  },
  newHistoryText: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  historyList: { marginTop: 13 },
  groupLabel: {
    marginTop: 10,
    marginBottom: 5,
    color: LIGHT_PROMPT_COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  historyItem: {
    minHeight: 55,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  historyItemActive: {
    backgroundColor: '#ECEBE6',
    borderWidth: 1,
    borderColor: LIGHT_PROMPT_COLORS.line,
  },
  historyItemMain: { flex: 1, minWidth: 0 },
  historyTitle: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  historyMeta: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 10, marginTop: 3 },
  more: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,20,18,.3)',
  },
  mentionBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,20,18,.3)',
  },
  mentionSheet: {
    maxHeight: '72%',
    minHeight: '32%',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: LIGHT_PROMPT_COLORS.background,
  },
  mentionList: { marginTop: 4 },
  mentionRow: {
    minHeight: 64,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mentionImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#ECEBE6',
  },
  mentionImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECEBE6',
  },
  mentionName: { flex: 1, color: LIGHT_PROMPT_COLORS.ink, fontSize: 15 },
  mentionEmpty: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 36 },
  mentionEmptyText: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 15 },
  mentionAddButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#ECEBE6',
  },
  mentionAddText: { color: LIGHT_PROMPT_COLORS.ink, fontSize: 14, fontWeight: '600' },
  sheet: {
    maxHeight: '80%',
    minHeight: '45%',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: LIGHT_PROMPT_COLORS.background,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: LIGHT_PROMPT_COLORS.line,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  sheetTitle: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  renameBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(20,20,18,.28)',
  },
  renameKeyboardSurface: { flex: 1 },
  renameCard: {
    width: '100%',
    maxWidth: 420,
    padding: 18,
    borderRadius: 20,
    backgroundColor: LIGHT_PROMPT_COLORS.background,
  },
  renameTitle: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  renameInput: {
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT_PROMPT_COLORS.line,
    color: LIGHT_PROMPT_COLORS.ink,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    marginTop: 14,
  },
  renameCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: '#ECEBE6',
  },
  renameCancelText: {
    color: LIGHT_PROMPT_COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  renameConfirm: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
  },
  renameConfirmText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
