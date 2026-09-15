import { ImagePreview } from '../ui/ImagePreview';
import { styles, sentStyles, markdownStyles } from './PromptAssistantStyles';
import { HistoryList, type HistoryProps } from './HistoryList';
import { ToolTimeline } from './ToolTimeline';
export { ToolTimeline } from './ToolTimeline';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCopilotChatContext } from '@copilotkit/react-native';
import { CopilotMarkdown } from '@copilotkit/react-native/components';
import { getSourceUrl } from '@copilotkit/shared';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
  findNodeHandle,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
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
  normalizeMessages,
  sessionTitle,
  type ToolTimelineStep,
  type PresentationMessage,
} from './agentPresentation';
import { type PromptParseResult } from './promptParser';
import type { LocalThreadSnapshot } from './threadStore';
import { DraggableBottomSheet, type DraggableBottomSheetHandle } from '../ui/DraggableSheet';
import { nextFollowState, type TimelineMetrics } from './timelineScroll';
import { readComposerDraft } from './assistantWorkspace';
import { readPromptRuns, type PromptRun } from './runState';
import { RunTimelineRow } from './RunTimelineRow';
import { enrichRunTools, indexRunTools, projectRunTimeline } from './runTimeline';
import { readPromptVersions, restorePromptVersion } from './promptVersions';
import { PromptVersionPanel, type WorkflowChoice } from './PromptVersionPanel';
import type { PromptHandoff } from '../handoff/promptHandoff';
import { imageReferenceOrdinal } from '../handoff/promptBindings';
import { createAgentId } from './submissionCommands';
import { validateImageBudget } from '../media/attachments';
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

export type RunIssue = { kind: 'error' | 'aborted' | 'submit' | 'validation'; message: string; runId?: string };

function isCompactPromptLayout(width: number, fontScale: number): boolean {
  return width < 400 || fontScale > 1.15;
}

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
  persistentNotice = false,
  runIssue = null,
  onRunIssueChange = () => undefined,
  onRetry = async () => undefined,
  onAccept,
  onSearchHistory,
  onLoadMoreHistory,
  transcript,
  transcriptRevision,
  workflowDefinition,
  workflows,
  workflowLoadIssue,
  onReloadWorkflow,
}: HistoryProps & {
  onExportPrompt: (prompt: string, artifactId?: string) => Promise<void>;
  onExportHandoff?: (handoff: PromptHandoff) => Promise<void>;
  clientState?: Record<string, unknown>;
  onClientStateChange?: (patch: Record<string, unknown>) => void;
  isVisible?: boolean;
  notice?: string;
  persistentNotice?: boolean;
  runIssue?: RunIssue | null;
  onRunIssueChange?: (issue: RunIssue | null) => void;
  onRetry?: (runId?: string) => Promise<void>;
  onAccept?: (input: { id: string; text: string; attachments: unknown[]; draftRevision: number }) => Promise<void>;
  transcript?: readonly unknown[];
  transcriptRevision?: number;
  workflowDefinition?: WorkflowDefinition;
  workflows?: WorkflowChoice[];
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
  const [dismissedNotice, setDismissedNotice] = useState<string>();
  useEffect(() => setDismissedNotice(undefined), [notice, activeThreadId]);
  const [draft, setDraft] = useState(initialComposer.text);
  const draftRef = useRef(draft); draftRef.current = draft;
  const draftRevision = useRef(Number((state.h3Composer as any)?.revision) || 0);
  const [galleryAttachments, setGalleryAttachments] = useState<AssistantImageAttachment[]>(initialComposer.attachments);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(154);
  const versionSheet = useRef<DraggableBottomSheetHandle>(null);
  const briefSheet = useRef<DraggableBottomSheetHandle>(null);
  const [brief, setBrief] = useState({ subject: '', camera: '', style: '', duration: '' });
  const hasBrief = Object.values(brief).some(value => value.trim());
  // Runtime snapshots are published at a bounded rate. The SDK-only fallback
  // remains uncached because the SDK can mutate its message array in place.
  const projectionRevision = transcriptRevision ?? clientState;
  const transcriptKey = transcriptRevision === undefined ? transcript : activeThreadId;
  const toolIndex = useMemo(() => transcript ? indexRunTools(transcript) : undefined, [transcriptKey, projectionRevision]);
  const cachedRuns = useMemo(() => transcript ? enrichRunTools(readPromptRuns(state), transcript, toolIndex) : null, [transcriptKey, toolIndex, state.h3Runs]);
  const runs = cachedRuns ?? enrichRunTools(readPromptRuns(state), messages);
  const completedMessageIds = useMemo(() => Array.isArray(state.h3CompletedMessageIds) ? state.h3CompletedMessageIds.filter((id: unknown): id is string => typeof id === 'string') : [], [state.h3CompletedMessageIds]);
  const savedVersions = useMemo(() => readPromptVersions(state), [state.h3Versions]);
  const hiddenVersions = Array.isArray(state.h3HiddenVersionIds) ? state.h3HiddenVersionIds as string[] : [];
  const versions = savedVersions.filter(version => !hiddenVersions.includes(version.id));
  const latestEnd = runs.reduce((time, run) => Math.max(time, run.endedAt ?? 0), 0);
  useEffect(() => { if (isVisible) onClientStateChange?.({ h3ReadAt: Date.now() }); }, [activeThreadId, latestEnd, isVisible, onClientStateChange]);
  const [inputSelection, setInputSelection] = useState({ start: initialComposer.text.length, end: initialComposer.text.length });
  const [mentionSheetOpen, setMentionSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const attachmentNames = useRef(new Map(initialComposer.attachments.map(item => [item.id, item.displayName ?? '图片1'])));
  const nextAttachmentNumber = useRef(1 + Math.max(0, ...initialComposer.attachments.map(item => imageReferenceOrdinal(item.displayName ?? '') ?? 0)));
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const compactActions = isCompactPromptLayout(width, fontScale);
  const wide = width >= 900 && height >= 480;
  // AbstractAgent mutates its messages array when addMessage() is called. Do
  // not memoize by array identity or the first user bubble waits for the next
  // streamed event before becoming visible.
  const projectTimeline = useRef(createTimelineProjection()).current;
  const cachedRows = useMemo(() => transcript ? projectTimeline(transcript) : null, [transcriptKey, projectionRevision, projectTimeline]);
  const rows = cachedRows ?? projectTimeline(messages);
  const handleSubmit = async (value: string) => {
    if (submitLock.current || isRunning) return;
    if (value.length > 4000) {
      onRunIssueChange({ kind: 'validation', message: '消息超过 4,000 字符，请缩短后重新发送；完整草稿已保留。' });
      return;
    }
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
      } catch (reason) { onRunIssueChange({ kind: 'submit', message: reason instanceof Error ? reason.message : '发送失败，草稿已保留' }); }
      finally { submitLock.current = false; setSubmitting(false); }
  };
  const pickerLock = useRef(false);
  const addGalleryImages = async (source: 'gallery' | 'file', returnToMentions: boolean) => {
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const remaining = Math.max(0, 9 - attachments.length - galleryAttachments.length);
      if (!remaining) {
        Alert.alert('添加图片失败', '参考图片最多 9 张，请先移除部分附件');
        return;
      }
      const picked = await pickAssistantImages(source, remaining);
      validateImageBudget([...attachments, ...galleryAttachments, ...picked]);
      setGalleryAttachments((current) => mergeUniqueAssistantAttachments(
        current,
        picked,
        new Set(attachments.map((attachment) => attachment.id)),
      ));
    } catch (error) {
      Alert.alert('添加图片失败', error instanceof Error ? error.message : '读取图片失败，请重试');
    } finally { pickerLock.current = false; if (returnToMentions) setMentionSheetOpen(true); }
  };
  const handleOpenPicker = async (returnToMentions = false) => {
    const cancel = () => { if (returnToMentions) setMentionSheetOpen(true); };
    Alert.alert('添加图片附件', '选择图片来源', [
      { text: '从相册选择', onPress: () => void addGalleryImages('gallery', returnToMentions) },
      { text: '从文件选择', onPress: () => void addGalleryImages('file', returnToMentions) },
      { text: '取消', style: 'cancel', onPress: cancel },
    ], { cancelable: true, onDismiss: cancel });
  };
  const historyImageNames = useMemo(() => {
    const names = new Map<string, string>();
    let nextNumber = 1;
    for (const row of rows) {
      if (row.kind !== 'user') continue;
      for (const image of row.attachments) {
        const ordinal = imageReferenceOrdinal(image.displayName ?? '');
        if (ordinal) nextNumber = Math.max(nextNumber, ordinal + 1);
        if (image.attachmentId && image.displayName) names.set(image.attachmentId, image.displayName);
      }
    }
    return { names, nextNumber };
  }, [rows]);
  const composerImageNames = (() => {
    // Allocate on a detached map so discarded renders cannot consume numbers.
    const names = new Map([...attachmentNames.current, ...historyImageNames.names]);
    const named = assignImageDisplayNames(
      [...attachments, ...galleryAttachments] as AttachmentLike[],
      names,
      Math.max(nextAttachmentNumber.current, historyImageNames.nextNumber),
    );
    return { ...named, names };
  })();
  const composerAttachments = composerImageNames.attachments;
  useLayoutEffect(() => {
    attachmentNames.current = composerImageNames.names;
    nextAttachmentNumber.current = composerImageNames.nextNumber;
  });
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
      onRenameVisibilityChange={setRenameOpen}
      onSearchHistory={onSearchHistory}
      onLoadMoreHistory={onLoadMoreHistory}
    />
  );
  return (
    <KeyboardAvoidingView
      // Use the actual container/keyboard intersection. Window-height deltas
      // cannot account for a custom tab bar disappearing or modal windows.
      behavior="padding"
      keyboardVerticalOffset={insets.top}
      enabled={isVisible && (wide || !historyOpen) && !renameOpen && !briefOpen && !versionsOpen && !mentionSheetOpen}
      // Keep resting space outside the padding controlled by keyboard avoidance.
      style={[styles.root, { marginBottom: Math.max(insets.bottom, 8) }]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="打开对话历史"
          onPress={() => { if (!wide) setHistoryOpen(true); }}
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
          {notice && (persistentNotice || notice !== dismissedNotice) && notice !== runIssue?.message ? (
            <View style={styles.notice}>
              <AppIcon name="info" size={16} color={LIGHT_PROMPT_COLORS.accent} />
              <Text accessibilityRole="alert" style={styles.noticeText}>{notice}</Text>{!persistentNotice && <Pressable accessibilityRole="button" accessibilityLabel="关闭提示" onPress={() => setDismissedNotice(notice)} style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}><Text>关闭</Text></Pressable>}
            </View>
          ) : null}
          <ConversationTimeline
            bottomInset={composerHeight}
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
            onResend={() => handleSubmit(draft)}
            onDismissIssue={() => onRunIssueChange(null)}
            onRetry={onRetry}
            onSelectSuggestion={applySuggestion}
          />
          <View pointerEvents="box-none" style={styles.composerDock} onLayout={({ nativeEvent }) => setComposerHeight(nativeEvent.layout.height)}>
            <View pointerEvents="box-none" testID="composer-actions" style={styles.composerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="补充创作信息" accessibilityState={{ expanded: briefOpen }} onPress={() => setBriefOpen(true)} style={({ pressed }) => [styles.composerAction, compactActions && styles.composerActionCompact, pressed && styles.composerActionPressed]}>
                <AppIcon name="filter_list" size={18} color={LIGHT_PROMPT_COLORS.muted} />
                <Text style={styles.composerActionText}>{compactActions ? '创作信息' : '补充创作信息'}</Text>
                <AppIcon name="expand_more" size={16} color={LIGHT_PROMPT_COLORS.muted} />
              </Pressable>
              {versions.length ? <Pressable accessibilityRole="button" accessibilityLabel="打开 Prompt 版本" accessibilityState={{ expanded: versionsOpen }} onPress={() => setVersionsOpen(true)} style={({ pressed }) => [styles.composerAction, compactActions && styles.composerActionCompact, pressed && styles.composerActionPressed]}>
                <AppIcon name="list_alt" size={18} color={LIGHT_PROMPT_COLORS.muted} />
                <Text style={styles.composerActionText}>{compactActions ? '版本' : 'Prompt 版本'}</Text>
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
                if (!isRunning) return;
                agent.abortRun?.();
                onRunIssueChange({ kind: 'aborted', message: '已停止生成' });
              }}
              isRunning={isRunning}
              submitting={submitting}
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
          setMentionSheetOpen(false);
          void handleOpenPicker(true);
        }}
      />
      <DraggableBottomSheet ref={versionSheet} visible={versionsOpen} title="Prompt 版本" onClose={() => setVersionsOpen(false)}>
          {versionsOpen && !workflowDefinition ? <View style={{ gap: 12 }}><Text accessibilityRole={workflowLoadIssue ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.noticeText}>{workflowLoadIssue ?? '正在加载工作流…'}</Text>{workflowLoadIssue && onReloadWorkflow ? <Pressable accessibilityRole="button" accessibilityLabel="重新加载工作流" onPress={onReloadWorkflow} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>重新加载工作流</Text></Pressable> : null}</View> : null}
          {versionsOpen && workflowDefinition ? <PromptVersionPanel workflows={workflows} workflowDefinition={workflowDefinition} inSheet onDelete={id => onClientStateChange?.({ h3HiddenVersionIds: [...hiddenVersions, id] })} onExpand={() => versionSheet.current?.expand()} versions={versions} selectedVersionId={typeof state.h3SelectedVersionId === 'string' ? state.h3SelectedVersionId : undefined} threadId={activeThreadId} onSelect={id => onClientStateChange?.({ h3SelectedVersionId: id })} onRestore={(id, commandId) => {
            const next = restorePromptVersion(savedVersions, id, Date.now(), commandId);
            onClientStateChange?.({ h3Versions: next, h3SelectedVersionId: next[next.length - 1]?.id });
          }} onExport={async handoff => { if (onExportHandoff) await onExportHandoff(handoff); else await onExportPrompt(handoff.prompt); setVersionsOpen(false); }} /> : null}
      </DraggableBottomSheet>
      <DraggableBottomSheet ref={briefSheet} visible={briefOpen} title="补充创作信息" onClose={() => setBriefOpen(false)} footer={
          <Pressable accessibilityRole="button" accessibilityLabel="加入创作草稿" disabled={!hasBrief} accessibilityState={{ disabled: !hasBrief }} style={[briefStyles.submit, !hasBrief && { opacity: 0.45 }]} onPress={() => {
            const labels = { subject: '主体与动作', camera: '镜头与运动', style: '风格与氛围', duration: '期望时长' };
            const extra = (Object.keys(brief) as Array<keyof typeof brief>).filter(key => brief[key].trim()).map(key => `${labels[key]}：${brief[key].trim()}`).join('\n');
            if (!extra) return;
            applySuggestion([draft.trim(), extra].filter(Boolean).join('\n'));
            setBrief({ subject: '', camera: '', style: '', duration: '' });
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

export function ConversationTimeline({
  rows,
  onResend,
  onDismissIssue,
  isRunning,
  onExportPrompt,
  runIssue = null,
  onRetry = async () => undefined,
  onSelectSuggestion = () => undefined,
  completedMessageIds = [],
  runs = [],
  latestVersionMessageId,
  bottomInset = 0,
}: {
  rows: ReturnType<typeof normalizeMessages>;
  onResend?: () => Promise<void>;
  onDismissIssue?: () => void;
  isRunning: boolean;
  onExportPrompt: (prompt: string, artifactId?: string) => Promise<void>;
  runIssue?: RunIssue | null;
  onRetry?: (runId?: string) => Promise<void>;
  onSelectSuggestion?: (suggestion: string) => void;
  completedMessageIds?: readonly string[];
  runs?: PromptRun[];
  latestVersionMessageId?: string;
  bottomInset?: number;
}) {
  const listRef = useRef<FlatList<ReturnType<typeof projectRunTimeline>[number]>>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const [viewportHeight, setViewportHeight] = useState(0);
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
  const previousRowCount = useRef(allRows.length);
  useLayoutEffect(() => {
    // Scrolling inspiration must not opt the first conversation out of following.
    if (previousRowCount.current === 0 && allRows.length > 0) setFollow(true);
    previousRowCount.current = allRows.length;
  }, [allRows.length, setFollow]);
  const bottomDistance = useRef(0);
  const [unread, setUnread] = useState(false);
  useEffect(() => { if (!followingLatestRef.current) setUnread(true); }, [allRows]);
  const inspectProcess = useCallback(() => { if (bottomDistance.current > 80) setFollow(false); }, [setFollow]);
  const scrollToLatest = useCallback((animated = !isRunning) => {
    // Keep the inspiration header visible when the empty page exceeds the viewport.
    if (allRows.length && followingLatestRef.current) listRef.current?.scrollToEnd({ animated });
  }, [isRunning, allRows.length]);
  useEffect(() => {
    scrollToLatest();
  }, [isRunning, scrollToLatest, rows.length]);
  const updateFollow = useCallback((type: 'scroll' | 'scroll-end', metrics: TimelineMetrics) => {
    bottomDistance.current = metrics.contentSize.height - metrics.layoutMeasurement.height - metrics.contentOffset.y;
    if (followingLatestRef.current) setUnread(false);
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
          scrollIndicatorInsets={{ bottom: bottomInset }}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScrollBeginDrag={() =>
            { if (bottomDistance.current > 80) setFollow(false); }
          }
          onScroll={({ nativeEvent }) => updateFollow('scroll', nativeEvent)}
          onMomentumScrollEnd={({ nativeEvent }) =>
            updateFollow('scroll-end', nativeEvent)
          }
          onScrollEndDrag={({ nativeEvent }) =>
            updateFollow('scroll-end', nativeEvent)
          }
          onContentSizeChange={() => scrollToLatest()}
          onLayout={({ nativeEvent }) => {
            setViewportHeight(nativeEvent.layout.height);
            scrollToLatest();
          }}
          ListEmptyComponent={
            isRunning ? (
              <RunningIndicator />
            ) : (
              <EmptyTimeline viewportHeight={Math.max(0, viewportHeight - bottomInset)} onSelectSuggestion={onSelectSuggestion} />
            )
          }
          ListFooterComponent={
            <View style={{ paddingBottom: bottomInset }}>
            {runIssue ? <RunIssueRow issue={runIssue} onRetry={runIssue.kind === 'submit' ? onResend ?? (async () => undefined) : onRetry} onDismiss={onDismissIssue} disabled={isRunning} /> : !runs.length && allRows.length > 0 && isRunning ? (
              <RunningIndicator compact />
            ) : null}
            </View>
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
        {allRows.length > 0 && !followingLatest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="回到最新消息"
            accessibilityHint={unread ? '有新内容，点击滚动到最新消息' : '滚动到对话底部'}
            onPress={() => {
              setUnread(false); setFollow(nextFollowState(followingLatestRef.current, { type: 'back-to-latest' }));
              listRef.current?.scrollToEnd({ animated: true });
            }}
            style={({ pressed }) => [styles.latestButton, { bottom: bottomInset + 8 }, pressed && styles.composerActionPressed]}
          >
            <AppIcon name="arrow_downward" size={22} color={LIGHT_PROMPT_COLORS.ink} />
            {unread ? <View pointerEvents="none" style={styles.latestUnreadDot} /> : null}
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
                  <Pressable accessibilityRole="button" accessibilityLabel={`查看参考图片 ${attachment.displayName ?? `图片${index + 1}`}`} key={`${attachment.uri}-${index}`} onPress={() => onPreview(attachment.uri)}><Image
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
  onDismiss,
  disabled,
}: {
  issue: RunIssue;
  onDismiss?: () => void;
  disabled?: boolean;
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => {
    if (retrying || disabled) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch { /* owning screen retains the actionable issue */ } finally {
      setRetrying(false);
    }
  };
  return (
    <View accessibilityRole="alert" style={styles.runIssue}>
<Text style={styles.runIssueText}>{issue.message}</Text>{onDismiss ? <Pressable accessibilityRole="button" accessibilityLabel="关闭运行提示" onPress={onDismiss} style={{ minHeight: 48 }}><Text>关闭</Text></Pressable> : null}
      {issue.kind !== 'validation' ? <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={issue.kind === 'submit' ? '重新发送草稿' : '重试上一轮'}
        accessibilityState={{ disabled: retrying }}
        disabled={retrying || disabled}
        onPress={() => void handleRetry()}
        style={styles.runIssueAction}
      >
        <Text style={styles.runIssueActionText}>
          {retrying ? '正在重试…' : issue.kind === 'submit' ? '重新发送' : '重试'}
        </Text>
      </Pressable></> : null}
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
  viewportHeight,
}: {
  onSelectSuggestion: (suggestion: string) => void;
  viewportHeight: number;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const compact = isCompactPromptLayout(width, fontScale) || (viewportHeight || height) < 500;
  const cardWidth = Math.min(300, Math.max(160, (width - 32) * 0.76));
  return (
    <View style={[styles.empty, compact && { paddingTop: 4, paddingBottom: 4 }]}>
      <View style={styles.emptyHeading}>
        <View style={styles.emptyMark}>
          <AppIcon name="auto_awesome" size={23} color="#FFFFFF" />
        </View>
        <Text style={[styles.emptyTitle, compact && { fontSize: 20, lineHeight: 28 }]}>叮～今日灵感掉落</Text>
      </View>
      <Text style={styles.emptySubtitle}>
        从一个灵感开始，让画面慢慢成形。
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" snapToInterval={cardWidth + 14} decelerationRate="fast" contentContainerStyle={[styles.inspirationRail, compact && { paddingTop: 14 }]}>
        {EMPTY_SUGGESTIONS.slice(0, Math.ceil(EMPTY_SUGGESTIONS.length / 2)).map((suggestion, index) => (
          <Pressable
            key={suggestion}
            accessibilityRole="button"
            accessibilityLabel={`使用建议 ${suggestion}`}
            accessibilityHint="填入输入框，可修改后发送"
            onPress={() => onSelectSuggestion(suggestion)}
            style={({ pressed }) => [styles.inspirationCard, { width: cardWidth, backgroundColor: index === 0 ? COLORS.primary : COLORS.warning }, compact && { padding: 14, borderRadius: 20 }, pressed && styles.inspirationPressed]}
          >
            <View style={styles.inspirationCategory}>
              <AppIcon name={index === 0 ? 'auto_awesome' : 'movie_filter'} size={18} color="#F3F2EB" />
              <Text style={styles.inspirationCategoryText}>{index === 0 ? '镜头灵感' : '风格实验室'}</Text>
            </View>
            {!compact && <View testID="inspiration-artwork" style={styles.inspirationArtwork} accessible={false} importantForAccessibility="no-hide-descendants">
              <View style={[styles.artOrb, { backgroundColor: index === 0 ? '#B6C9B3' : '#E5CDB0' }]} />
              <View style={[styles.artFrame, { transform: [{ rotate: index === 0 ? '-12deg' : '12deg' }] }]}>
                <AppIcon name={index === 0 ? 'movie_filter' : 'auto_awesome'} size={42} color="#FFFFFF" />
              </View>
              <Text style={styles.artCaption}>{index === 0 ? 'MOTION / 01' : 'STUDIO / 02'}</Text>
            </View>}
            <Text style={[styles.inspirationTitle, compact && { fontSize: 18, lineHeight: 26, minHeight: 0, marginTop: 16 }]}>{suggestion}</Text>
            <View style={[styles.inspirationCta, compact && { marginTop: 14 }]}>
              <Text style={styles.inspirationCtaText}>试试这个灵感</Text>
              <Text style={styles.inspirationCtaText}>↗</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.suggestions}>
        {EMPTY_SUGGESTIONS.slice(Math.ceil(EMPTY_SUGGESTIONS.length / 2)).map((suggestion) => (
          <Pressable
            key={suggestion}
            accessibilityRole="button"
            accessibilityLabel={`使用建议 ${suggestion}`}
            onPress={() => onSelectSuggestion(suggestion)}
            style={({ pressed }) => [styles.suggestion, pressed && styles.composerActionPressed]}
          >
            <Text style={styles.suggestionArrow}>↘</Text>
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
  return <Pressable accessibilityRole="button" accessibilityLabel={`复制回答 ${text.slice(0, 20)}`} onPress={() => void copy()} style={styles.assistantCopy}>
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
          <Text style={styles.primaryActionText}>{exporting ? '正在导出…' : '查看 Prompt 版本'}</Text>
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
              <Text accessibilityLiveRegion="polite" style={styles.mentionEmptyText}>{attachments.some(item => item.status === 'uploading') ? '图片正在上传，完成后可引用' : '先上传图片附件'}</Text>
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
  return <ImagePreview uri={uri} onClose={onClose} />;
}

export function Composer({
  value,
  onChangeText,
  onSubmit,
  onOpenPicker,
  onOpenMentionPicker,
  onCancel,
  isRunning,
  submitting = false,
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
  submitting?: boolean;
  attachments: AttachmentLike[];
  onRemoveAttachment?: (id: string) => void;
  inputRef?: React.RefObject<TextInput | null>;
  selection?: { start: number; end: number };
  onSelectionChange?: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const insets = useSafeAreaInsets();
  const editorRef = useRef<TextInput>(null);
  const nearLimit = value.length >= 3600;
  const overLimit = value.length > 4000;
  const closeEditor = () => setEditing(false);
  const counter = nearLimit ? (
    <Text accessibilityLiveRegion="polite" accessibilityLabel={overLimit ? `已超出 ${value.length - 4000} 字，请缩短后发送，草稿已保留` : `已输入 ${value.length} 字，上限 4000 字`}
      style={[styles.characterCount, overLimit && styles.characterCountError]}>
      {overLimit ? `超出 ${value.length - 4000} 字` : `${value.length.toLocaleString()} / ${(4000).toLocaleString()}`}
    </Text>
  ) : null;
  const uploading = attachments.some((item) => item.status === 'uploading');
  const disabled =
    submitting || value.length > 4000 ||
    uploading ||
    (!value.trim() && !attachments.some((item) => item.status === 'ready'));
  return (
    <View style={[styles.composer, focused && styles.composerFocused]}>
      <Modal visible={editing} animationType="slide" onRequestClose={closeEditor} onShow={() => editorRef.current?.focus()}>
        <KeyboardAvoidingView behavior="padding" style={styles.editorRoot}>
          <View style={[styles.editorSurface, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.editorHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="收起编辑" onPress={closeEditor} style={({ pressed }) => [styles.editorClose, pressed && styles.composerActionPressed]}>
                <AppIcon name="close_fullscreen" size={21} color={LIGHT_PROMPT_COLORS.muted} />
              </Pressable>
              <Text style={styles.editorTitle}>创作想法</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="完成编辑" onPress={closeEditor} style={({ pressed }) => [styles.editorDone, pressed && styles.editorDonePressed]}>
                <Text style={styles.editorDoneText}>完成</Text>
              </Pressable>
            </View>
            <View style={styles.editorPaper}>
              <TextInput ref={editorRef} accessibilityLabel="全屏编辑创作想法" multiline value={value} onChangeText={onChangeText}
                placeholder="描述你想生成的画面…" placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
                selection={selection} onSelectionChange={onSelectionChange} scrollEnabled textAlignVertical="top"
                selectionColor={COLORS.primary} style={styles.editorInput} />
            </View>
            <View style={styles.editorFooter}><Text style={styles.editorHint}>收起后保留草稿</Text>{counter}</View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {uploading ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator /><Text>图片上传中，完成后可发送；可移除附件取消上传。</Text></View> : null}
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
          accessibilityLabel="创作想法"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="描述你想生成的画面…"
          placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
          multiline
          style={styles.input}
          editable
          scrollEnabled
          textAlignVertical="top"
          selection={selection}
          onSelectionChange={onSelectionChange}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="全屏编辑" accessibilityHint="展开编辑长文本" onPress={() => setEditing(true)} style={({ pressed }) => [styles.expandEditor, pressed && styles.composerActionPressed]}>
          <AppIcon name="open_in_full" size={19} color={LIGHT_PROMPT_COLORS.muted} />
        </Pressable>
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
        {counter}
        <Pressable
          accessibilityLabel={isRunning ? '停止生成' : submitting ? '发送中' : '发送消息'}
          accessibilityState={{ disabled: !isRunning && disabled, busy: submitting }}
          disabled={!isRunning && disabled}
          onPress={() => { if (isRunning) onCancel(); else if (!disabled) onSubmit(value); }}
          style={[
            styles.sendButton,
            !isRunning && disabled && styles.sendDisabled,
          ]}
        >
          {submitting && !isRunning ? <ActivityIndicator size="small" color={LIGHT_PROMPT_COLORS.muted} /> : <AppIcon
            name={isRunning ? 'close' : 'send'}
            size={18}
            color={
              isRunning || !disabled ? '#FFFFFF' : LIGHT_PROMPT_COLORS.muted
            }
          />}
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
