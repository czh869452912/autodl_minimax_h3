import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCopilotChatContext } from '@copilotkit/react-native';
import { CopilotMarkdown } from '@copilotkit/react-native/components';
import { getSourceUrl } from '@copilotkit/shared';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
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
import { LIGHT_PROMPT_COLORS } from '../ui/theme';
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
} from './agentPresentation';
import { type PromptParseResult } from './promptParser';
import type { LocalThreadSnapshot } from './threadStore';
import { DraggableBottomSheet } from '../ui/DraggableSheet';

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
};

export function PromptAssistantUi({
  threads,
  activeThreadId,
  onSelect: onSelectThread,
  onNew: onNewThread,
  onDelete: onDeleteThread,
  onRename: onRenameThread,
  onExportPrompt,
  notice,
}: HistoryProps & { onExportPrompt: (prompt: string) => Promise<void>; notice?: string }) {
  const {
    messages,
    isRunning,
    submitMessage,
    attachments,
    openPicker,
    removeAttachment,
    agent,
  } = useCopilotChatContext();
  const [draft, setDraft] = useState('');
  const [galleryAttachments, setGalleryAttachments] = useState<AssistantImageAttachment[]>([]);
  const [inputSelection, setInputSelection] = useState({ start: 0, end: 0 });
  const [mentionSheetOpen, setMentionSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const attachmentNames = useRef(new Map<string, string>());
  const nextAttachmentNumber = useRef(1);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState<number | null>(null);
  // Keep the keyboard-hidden height captured at mount. Updating this while
  // Android is resizing the window would make the resize delta look like zero
  // and re-apply the full keyboard height (the extra tab-bar-sized lift seen
  // on some edge-to-edge devices).
  const baselineHeight = useRef(height);
  const wide = width >= 720;
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
  const persistedRows = normalizeMessages(messages);
  const [pendingRow, setPendingRow] = useState<Extract<ReturnType<typeof normalizeMessages>[number], { kind: 'user' }> | null>(null);
  const rows = useMemo(() => {
    if (!pendingRow) return persistedRows;
    const alreadyPersisted = persistedRows.some(
      (row) =>
        row.kind === 'user' &&
        row.text === pendingRow.text &&
        row.attachments.length === pendingRow.attachments.length,
    );
    return alreadyPersisted ? persistedRows : [...persistedRows, pendingRow];
  }, [pendingRow, persistedRows]);
  useEffect(() => {
    if (!pendingRow) return;
    if (
      persistedRows.some(
        (row) =>
          row.kind === 'user' &&
          row.text === pendingRow.text &&
          row.attachments.length === pendingRow.attachments.length,
      )
    ) {
      setPendingRow(null);
    }
  }, [pendingRow, persistedRows]);
  const handleSubmit = async (value: string) => {
    if (submitLock.current || isRunning) return;
    const ready = [...attachments.filter((item) => item.status === 'ready'), ...galleryAttachments];
    if (!value.trim() && !ready.length)
      return;
    submitLock.current = true;
    setSubmitting(true);
    setStopNotice(null);
    const readyAttachments: Array<{ uri: string; filename?: string; displayName?: string }> = ready
      .map((item) => {
        if (!item.source) return null;
        const named = composerAttachments.find((attachment) => attachment.id === item.id);
        return {
          uri: getSourceUrl(item.source as never),
          ...(item.filename ? { filename: item.filename } : {}),
          ...(named?.displayName ? { displayName: named.displayName } : {}),
        };
      })
      .filter((item): item is { uri: string; filename?: string; displayName?: string } => Boolean(item && item.uri));
    setPendingRow({
      id: `pending-${Date.now()}`,
      kind: 'user',
      text: value,
      attachments: readyAttachments,
    });
    setDraft('');
    setInputSelection({ start: 0, end: 0 });
    if (galleryAttachments.length) {
      agent.setPendingAttachments?.(
        galleryAttachments,
        () => setGalleryAttachments([]),
      );
    }
    try {
      await submitMessage(value);
    } catch (error) {
      setStopNotice(error instanceof Error ? error.message : '发送失败');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const addGalleryImages = async () => {
    try {
      const remaining = Math.max(0, 9 - attachments.filter((item) => item.status === 'ready').length - galleryAttachments.length);
      const picked = await pickAssistantImages('gallery', remaining);
      setGalleryAttachments((current) => mergeUniqueAssistantAttachments(
        current,
        picked,
        new Set(attachments.map((attachment) => attachment.id)),
      ));
    } catch (error) {
      Alert.alert('相册不可用', error instanceof Error ? error.message : '读取相册图片失败');
    }
  };
  const handleOpenPicker = async () => {
    Alert.alert('添加图片附件', '选择图片来源', [
      { text: '从相册选择', onPress: () => void addGalleryImages() },
      { text: '从文件选择', onPress: () => void openPicker() },
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
          {stopNotice ?? notice ? (
            <View style={styles.notice}>
              <AppIcon name="info" size={16} color={LIGHT_PROMPT_COLORS.accent} />
              <Text style={styles.noticeText}>{stopNotice ?? notice}</Text>
            </View>
          ) : null}
          <ConversationTimeline
            rows={rows}
            isRunning={isRunning || submitting}
            onExportPrompt={onExportPrompt}
          />
          <View style={styles.composerDock}>
            <Composer
              value={draft}
              onChangeText={handleDraftChange}
              onSubmit={handleSubmit}
              onOpenPicker={handleOpenPicker}
              onOpenMentionPicker={() => setMentionSheetOpen(true)}
              onCancel={() => {
                agent.abortRun?.();
                setStopNotice('已停止生成');
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
          setMentionSheetOpen(false);
          void handleOpenPicker();
        }}
      />
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
}: {
  rows: ReturnType<typeof normalizeMessages>;
  isRunning: boolean;
  onExportPrompt: (prompt: string) => Promise<void>;
}) {
  const listRef = useRef<FlatList<ReturnType<typeof normalizeMessages>[number]>>(null);
  const timelineSignature = rows
    .map((row) =>
      row.kind === 'assistant'
        ? `${row.id}:${row.text}:${row.tools.map((step) => `${step.id}:${step.status}:${step.summary ?? ''}`).join(',')}`
        : `${row.id}:${row.text}`,
    )
    .join('\u0001');
  const scrollToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);
  useEffect(() => {
    scrollToLatest();
  }, [isRunning, scrollToLatest, timelineSignature]);
  return (
    <FlatList
      ref={listRef}
      data={rows}
      keyExtractor={(item) => item.id}
      style={styles.timeline}
      contentContainerStyle={styles.timelineContent}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={scrollToLatest}
      onLayout={() => scrollToLatest()}
      ListEmptyComponent={
        isRunning ? <RunningIndicator /> : <EmptyTimeline />
      }
      ListFooterComponent={rows.length && isRunning ? <RunningIndicator compact /> : null}
      renderItem={({ item }) =>
        item.kind === 'user' ? (
          <View style={styles.userRow}>
            {item.attachments.length ? (
              <ScrollView
                horizontal
                contentContainerStyle={sentStyles.sentAttachments}
              >
                {item.attachments.map((attachment, index) => (
                  <Image
                    key={`${attachment.uri}-${index}`}
                    source={{ uri: attachment.uri }}
                    style={sentStyles.sentAttachment}
                  />
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.userBubble}>
              <UserMessageText
                text={item.text || '（已添加参考图）'}
                attachments={item.attachments}
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
              {item.text ? (
                <CopilotMarkdown
                  content={item.text}
                  streamingAnimation={isRunning}
                  style={markdownStyles}
                />
              ) : null}
              {item.tools.length ? <ToolTimeline steps={item.tools} /> : null}
              {item.prompt ? (
                <PromptResultCard
                  result={item.prompt}
                  onExport={onExportPrompt}
                />
              ) : null}
            </View>
          </View>
        )
      }
    />
  );
}

function EmptyTimeline() {
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
        <Text style={styles.suggestion}>“一镜到底的城市夜跑”</Text>
        <Text style={styles.suggestion}>“纸艺风格的产品广告”</Text>
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

export function PromptResultCard({
  result,
  onExport,
}: {
  result: PromptParseResult;
  onExport: (prompt: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(result.promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <View style={styles.promptCard}>
      <View style={styles.promptCardHeader}>
        <View>
          <Text style={styles.promptCardEyebrow}>FINAL H3 PROMPT</Text>
          <Text style={styles.promptCardTitle}>可直接用于生成</Text>
        </View>
        <AppIcon
          name="auto_awesome"
          size={18}
          color={LIGHT_PROMPT_COLORS.muted}
        />
      </View>
      <Text selectable style={styles.promptText}>
        {result.promptText}
      </Text>
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
          <Text style={styles.secondaryActionText}>
            {copied ? '已复制' : '复制 Prompt'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="导出 Prompt 到生成"
          onPress={() => void onExport(result.promptText)}
          style={styles.primaryAction}
        >
          <Text style={styles.primaryActionText}>导出到生成</Text>
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
              accessibilityLabel={`移除附件 ${attachment.displayName || '图片'}`}
              onPress={() => onRemoveAttachment?.(attachment.id)}
              style={styles.removeAttachment}
            >
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Modal
        visible={Boolean(preview)}
        transparent
        onRequestClose={() => setPreview(null)}
      >
        <Pressable
          style={styles.previewBackdrop}
          onPress={() => setPreview(null)}
        >
          {preview?.source?.value ? (
            <Image
              source={{ uri: getSourceUrl(preview.source as never) }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
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
          editable={!isRunning}
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
}: {
  text: string;
  attachments: Array<{ uri: string; filename?: string; displayName?: string }>;
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
      <Text key={`mention-${match.start}`} testID="user-image-mention" style={styles.userMention}>
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
}: HistoryProps) {
  const [query, setQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<LocalThreadSnapshot | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState('');
  const groups = groupSessions(
    threads.filter((thread) => matchesSessionQuery(thread, query)),
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
        keyExtractor={(thread) => thread.threadId}
        renderSectionHeader={({ section }) => <Text style={styles.groupLabel}>{section.title}</Text>}
        renderItem={({ item: thread }) => (
          <Pressable
            onPress={() => onSelect(thread.threadId)}
            style={[styles.historyItem, thread.threadId === activeThreadId && styles.historyItemActive]}
          >
            <View style={styles.historyItemMain}>
              <Text numberOfLines={1} style={styles.historyTitle}>{sessionDisplayTitle(thread, threads)}</Text>
              <Text style={styles.historyMeta}>{sessionMessageCount(thread)} 条消息 · {new Date(thread.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
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
    width: 38,
    height: 38,
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
    color: LIGHT_PROMPT_COLORS.ink,
    backgroundColor: LIGHT_PROMPT_COLORS.surface,
    overflow: 'hidden',
  },
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
    width: 36,
    height: 36,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#ECEBE6' },
  attachments: { paddingHorizontal: 2, paddingBottom: 8, gap: 8 },
  attachment: { width: 55, height: 55, borderRadius: 12, overflow: 'visible' },
  attachmentImage: {
    width: 55,
    height: 55,
    borderRadius: 12,
    backgroundColor: '#ECEBE6',
  },
  attachmentLoading: {
    width: 55,
    height: 55,
    borderRadius: 12,
    backgroundColor: '#ECEBE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: LIGHT_PROMPT_COLORS.muted, fontSize: 9 },
  removeAttachment: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: LIGHT_PROMPT_COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#FFFFFF', fontSize: 15, lineHeight: 18 },
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
