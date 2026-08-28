import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, useLocalRuntime } from '@assistant-ui/react-native';
import { useComposerAddAttachment } from '@assistant-ui/core/react';
import { openDatabaseSync } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS, SPACING } from '../ui/theme';
import { adapter, createHistoryAdapter, officialSkillCount } from './runtime';

function MessageBubble() {
  const role = useAuiState((state) => state.message.role);
  const isUser = role === 'user';
  return (
    <MessagePrimitive.Root style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <MessagePrimitive.Content
          renderText={({ part }) => <Text selectable style={styles.messageText}>{part.text}</Text>}
          renderReasoning={({ part }) => <Text selectable style={styles.reasoningText}>{part.text}</Text>}
          renderFile={({ part }) => <Text style={styles.attachmentText}>附件：{part.filename || '文件'}</Text>}
        />
      </View>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  const running = useAuiState((state) => state.thread.isRunning);
  const { addAttachment } = useComposerAddAttachment();
  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'audio/*'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    const mime = file.mimeType || 'application/octet-stream';
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    await addAttachment({ id: `attachment-${Date.now()}`, name: file.name, type: mime.startsWith('image/') ? 'image' : 'file', contentType: mime, content: mime.startsWith('image/') ? [{ type: 'image', image: `data:${mime};base64,${base64}`, filename: file.name }] : [{ type: 'file', filename: file.name, data: base64, mimeType: mime }] });
  };
  return (
    <ComposerPrimitive.Root style={styles.composerRoot}>
      <Pressable accessibilityRole="button" onPress={() => void pickAttachment()} style={styles.attachButton}><AppIcon name="add_photo_alternate" size={21} color={COLORS.textMuted} /></Pressable>
      <ComposerPrimitive.Input multiline numberOfLines={3} submitMode="none" placeholder="描述你想生成的视频，助手会整理成 H3 Prompt…" placeholderTextColor={COLORS.textSubtle} style={styles.input} accessibilityLabel="Prompt 输入框" />
      {running ? <ComposerPrimitive.Cancel style={styles.sendButton}><AppIcon name="close" size={22} color={COLORS.text} /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send style={styles.sendButton}><AppIcon name="send" size={22} color={COLORS.text} /></ComposerPrimitive.Send>}
    </ComposerPrimitive.Root>
  );
}

function NewConversationButton() {
  const aui = useAui();
  const disabled = useAuiState((state) => state.thread.isRunning || state.thread.isEmpty);
  const clear = async () => {
    const ids = aui.thread.getState().messages.map((message) => message.id).reverse();
    for (const id of ids) await aui.thread.deleteMessage(id);
  };
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void clear()} style={({ pressed }) => [styles.newThreadButton, (disabled || pressed) && styles.buttonMuted]}><AppIcon name="add" size={20} color={COLORS.text} /><Text style={styles.newThreadText}>新对话</Text></Pressable>;
}

function AgentThread() {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.toolbar}>
        <View><Text style={styles.title}>Prompt 助手</Text><Text style={styles.subtitle}>官方 H3 skills · {officialSkillCount()} 个技能随 APK 发布</Text></View>
        <NewConversationButton />
      </View>
      <ThreadPrimitive.Root style={styles.threadRoot}>
        <ThreadPrimitive.MessagesFlatList style={styles.messages} contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled" autoScroll scrollToBottomOnInitialize scrollToBottomOnRunStart scrollToBottomOnThreadSwitch children={() => <MessageBubble />} />
        <ThreadPrimitive.Empty>
          <View style={styles.emptyState}>
            <AppIcon name="auto_awesome" size={34} color={COLORS.primaryActive} />
            <Text style={styles.emptyTitle}>把想法交给 H3 Prompt 助手</Text>
            <Text style={styles.emptyBody}>先说主题、画幅、时长和参考素材；助手会按官方技能规范逐步澄清并输出可复制的 integrated_multimodal_description。</Text>
            <ThreadPrimitive.Suggestion prompt="帮我写一个 9:16、5 秒的产品宣传视频 Prompt" send style={styles.suggestion}><Text style={styles.suggestionText}>试试：产品宣传视频</Text></ThreadPrimitive.Suggestion>
          </View>
        </ThreadPrimitive.Empty>
      </ThreadPrimitive.Root>
      <Composer />
    </KeyboardAvoidingView>
  );
}

export default function AgentScreen() {
  const db = useMemo(() => openDatabaseSync('autodl-h3.db'), []);
  const history = useMemo(() => createHistoryAdapter(db), [db]);
  const runtime = useLocalRuntime(adapter, { adapters: { history }, unstable_enableMessageQueue: true });
  return <AssistantRuntimeProvider runtime={runtime}><AgentThread /></AssistantRuntimeProvider>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, threadRoot: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800' }, subtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  newThreadButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, buttonMuted: { opacity: 0.45 }, newThreadText: { color: COLORS.text, fontWeight: '700' },
  messages: { flex: 1 }, messagesContent: { padding: SPACING.lg, gap: SPACING.md, flexGrow: 1 }, messageRow: { width: '100%', flexDirection: 'row' }, userRow: { justifyContent: 'flex-end' }, assistantRow: { justifyContent: 'flex-start' }, bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 }, userBubble: { backgroundColor: COLORS.primarySoft, borderBottomRightRadius: 4 }, assistantBubble: { backgroundColor: COLORS.surfaceRaised, borderBottomLeftRadius: 4 }, messageText: { color: COLORS.text, fontSize: 15, lineHeight: 22 }, reasoningText: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19, fontStyle: 'italic' }, attachmentText: { color: COLORS.textMuted, fontSize: 13 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxl, gap: SPACING.md }, emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }, emptyBody: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' }, suggestion: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }, suggestionText: { color: COLORS.primaryActive, fontWeight: '700' },
  composerRoot: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background }, input: { flex: 1, minHeight: 48, maxHeight: 130, color: COLORS.text, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10, fontSize: 15 }, sendButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  attachButton: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
});
