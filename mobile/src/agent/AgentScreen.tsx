import { CopilotChat } from '@copilotkit/react-native/components';
import { useAttachments } from '@copilotkit/react-native';
import { getSourceUrl } from '@copilotkit/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { readSettings } from '../settings/storage';
import { COLORS } from '../ui/theme';
import { createH3Agent } from './h3Agent';
import { LocalCopilotKitProvider } from './LocalCopilotKitProvider';
import { H3AgUiAgent } from './aguiAgent';
import { createLocalThreadStore, type LocalThreadSnapshot, type LocalThreadStore } from './threadStore';
import { isH3AgentConfigReady } from './agentTypes';
import { applyAgentSettings } from './agentConfig';
import { readImageAsDataSource } from './imageAttachmentUpload';
import { getH3AgentConfigError } from './modelAdapter';

type AgentConfig = { apiKey: string; endpoint: string; model: string };

/** CopilotKit owns chat rendering, streaming, tools, attachments and errors. */
export default function AgentScreen() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    void readSettings().then((settings) => {
      if (!active) return;
      try {
        const next = applyAgentSettings({ config: null, error: null }, settings);
        setConfig(next.config);
        setError(next.error);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '本地 Agent 配置无效');
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : '无法读取 Agent 设置');
    });
    return () => { active = false; };
  }, []);
  useFocusEffect(refresh);

  if (error) return <StatusView message={error} />;
  if (!config) return <StatusView loading />;
  if (!isH3AgentConfigReady(config)) return <StatusView message="尚未配置完整的 LLM 设置" />;
  const configError = getH3AgentConfigError(config);
  if (configError) {
    const message = configError === 'LLM API endpoint must be an HTTP(S) URL'
      ? 'LLM API 地址格式无效'
      : configError;
    return <StatusView message={message} />;
  }

  return <ReadyAgent key={`${config.endpoint}\u0000${config.model}\u0000${config.apiKey}`} config={config} onError={setError} />;
}

function ReadyAgent({ config, onError }: { config: AgentConfig; onError: (message: string) => void }) {
  const threadStore = useMemo<LocalThreadStore>(() => createLocalThreadStore(openDatabaseSync('autodl-h3.db')), []);
  const [threads, setThreads] = useState<Awaited<ReturnType<LocalThreadStore['list']>>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void threadStore.list().then((snapshots) => {
      if (!active) return;
      setThreads(snapshots);
      setActiveThreadId((current) => current && snapshots.some((snapshot) => snapshot.threadId === current)
        ? current
        : snapshots[0]?.threadId ?? null);
    }).catch((reason) => { if (active) onError(reason instanceof Error ? reason.message : '无法恢复本地助手会话'); });
    return () => { active = false; };
  }, [threadStore, onError]);

  const createSession = useCallback(async () => {
    try {
      const now = Date.now();
      const snapshot: LocalThreadSnapshot = { threadId: `h3-${now}-${Math.random().toString(36).slice(2, 8)}`, messages: [], state: {}, createdAt: now, updatedAt: now };
      await threadStore.save(snapshot);
      setThreads((current) => [snapshot, ...current]);
      setActiveThreadId(snapshot.threadId);
      setSessionPickerOpen(false);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '创建会话失败');
    }
  }, [onError, threadStore]);

  const handleSnapshotChange = useCallback((next: LocalThreadSnapshot) => {
    setThreads((current) => current.map((item) => item.threadId === next.threadId ? next : item));
  }, []);

  const deleteSession = useCallback((threadId: string) => {
    Alert.alert('删除会话', '删除后无法恢复本机会话记录。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void threadStore.remove(threadId).then(async () => {
        const next = await threadStore.list();
        setThreads(next);
        setActiveThreadId((current) => current === threadId ? next[0]?.threadId ?? null : current);
      }).catch((reason) => onError(reason instanceof Error ? reason.message : '删除会话失败')) },
    ]);
  }, [onError, threadStore]);

  const activeSnapshot = threads.find((snapshot) => snapshot.threadId === activeThreadId) ?? null;
  return (
    <View style={styles.readyRoot}>
      <SessionBar title={sessionTitle(activeSnapshot)} count={threads.length} onOpen={() => setSessionPickerOpen(true)} onNew={createSession} />
      {activeSnapshot ? <AgentSession key={activeSnapshot.threadId} config={config} snapshot={activeSnapshot} threadStore={threadStore} onError={onError} onSnapshotChange={handleSnapshotChange} /> : <StatusView message="还没有本地会话" />}
      <Modal visible={sessionPickerOpen} transparent animationType="slide" onRequestClose={() => setSessionPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sessionModal}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>本地会话</Text><Pressable onPress={() => setSessionPickerOpen(false)}><Text style={styles.modalClose}>×</Text></Pressable></View>
            <FlatList data={threads} keyExtractor={(item) => item.threadId} ListEmptyComponent={<Text style={styles.emptySessions}>暂无会话</Text>} renderItem={({ item }) => (
              <View style={[styles.sessionRow, item.threadId === activeThreadId && styles.sessionRowActive]}>
                <Pressable style={styles.sessionSelect} onPress={() => { setActiveThreadId(item.threadId); setSessionPickerOpen(false); }}>
                  <Text style={styles.sessionName} numberOfLines={1}>{sessionTitle(item)}</Text>
                  <Text style={styles.sessionMeta}>{item.messages.length} 条消息 · {formatSessionTime(item.updatedAt)}</Text>
                </Pressable>
                <Pressable accessibilityLabel="删除会话" onPress={() => deleteSession(item.threadId)}><Text style={styles.deleteText}>删除</Text></Pressable>
              </View>
            )} />
            <Pressable style={styles.newSessionButton} onPress={createSession}><Text style={styles.newSessionText}>＋ 新会话</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AgentSession({ config, snapshot, threadStore, onError, onSnapshotChange }: { config: AgentConfig; snapshot: LocalThreadSnapshot; threadStore: LocalThreadStore; onError: (message: string) => void; onSnapshotChange: (snapshot: LocalThreadSnapshot) => void }) {
  const agent = useMemo(() => new H3AgUiAgent(createH3Agent(config) as never), [config]);
  const hydratedRef = useRef(false);
  const initialSnapshot = useRef(snapshot);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  useEffect(() => {
    agent.threadId = initialSnapshot.current.threadId;
    agent.setMessages(initialSnapshot.current.messages);
    agent.setState(initialSnapshot.current.state);
    hydratedRef.current = true;
    let saveQueue = Promise.resolve();
    const subscription = agent.subscribe({ onMessagesChanged: ({ messages, state }) => {
      if (!hydratedRef.current) return;
      const nextSnapshot = { threadId: agent.threadId, messages: [...messages] as never, state: { ...state }, createdAt: initialSnapshot.current.createdAt, updatedAt: Date.now() };
      onSnapshotChange(nextSnapshot);
      saveQueue = saveQueue.then(() => threadStore.save(nextSnapshot)).catch((reason) => onError(reason instanceof Error ? `本地会话保存失败：${reason.message}` : '本地会话保存失败'));
    }});
    return () => { hydratedRef.current = false; subscription.unsubscribe(); };
  }, [agent, onError, onSnapshotChange, threadStore]);
  return <LocalCopilotKitProvider agent={agent} onError={(error) => setRuntimeError(error.message || 'Agent 运行失败')}><View style={styles.chatShell}>{runtimeError ? <View style={styles.runtimeError}><Text style={styles.runtimeErrorTitle}>本次请求失败</Text><Text style={styles.runtimeErrorText}>{runtimeError}</Text><Pressable onPress={() => setRuntimeError(null)}><Text style={styles.runtimeErrorDismiss}>关闭提示</Text></Pressable></View> : null}<CopilotChat agentName={agent.agentId} headerTitle="Prompt 助手" placeholder="描述你想生成的视频，助手会整理成 H3 Prompt…" emptyStateTitle="把想法交给 H3 Prompt 助手" emptyStateSubtitle="官方 H3 skills 与真实工具调用由本机 DeepAgents 处理。" style={styles.chat} /><AttachmentBridge agent={agent} /></View></LocalCopilotKitProvider>;
}

function sessionTitle(snapshot: { messages: unknown[] } | null): string {
  const first = snapshot?.messages.find((message) => (message as { role?: string }).role === 'user') as { content?: unknown } | undefined;
  return typeof first?.content === 'string' && first.content.trim() ? first.content.trim() : '新会话';
}

function formatSessionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SessionBar({ title, count, onOpen, onNew }: { title: string; count: number; onOpen: () => void; onNew: () => void }) {
  return <View style={styles.sessionBar}><Pressable style={styles.sessionPickerButton} onPress={onOpen} accessibilityLabel="切换本地会话"><Text style={styles.sessionBarLabel}>会话</Text><Text style={styles.sessionBarTitle} numberOfLines={1}>{title}</Text><Text style={styles.sessionBarCount}>{count}</Text><Text style={styles.sessionChevron}>⌄</Text></Pressable><Pressable style={styles.newSessionSmall} onPress={() => void onNew()}><Text style={styles.newSessionSmallText}>＋ 新会话</Text></Pressable></View>;
}

function AttachmentBridge({ agent }: { agent: H3AgUiAgent }) {
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const { attachments, openPicker, removeAttachment, consumeAttachments } = useAttachments({
    config: {
      enabled: true,
      accept: 'image/*',
      onUpload: (file) => readImageAsDataSource(file),
      onUploadFailed: ({ message }) => setAttachmentError(message),
    },
  });
  const readyAttachments = attachments.filter((attachment) => attachment.status === 'ready');

  useEffect(() => {
    agent.setPendingAttachments(readyAttachments, () => { consumeAttachments(); });
  }, [agent, readyAttachments, consumeAttachments]);

  return (
    <View pointerEvents="box-none" style={styles.attachmentLayer}>
      <View style={styles.attachmentTray} pointerEvents="box-none">
        {readyAttachments.map((attachment) => (
          <View key={attachment.id} style={styles.attachmentPreview}>
            <Image source={{ uri: getSourceUrl(attachment.source) }} style={styles.attachmentImage} />
            <Pressable
              accessibilityLabel={`移除附件 ${attachment.filename ?? '图片'}`}
              onPress={() => removeAttachment(attachment.id)}
              style={styles.attachmentRemove}
            >
              <Text style={styles.attachmentRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}
        <Pressable accessibilityLabel="添加图片附件" onPress={() => { setAttachmentError(null); void openPicker(); }} style={styles.attachmentButton}>
          <Text style={styles.attachmentButtonText}>＋</Text>
        </Pressable>
      </View>
      {attachmentError ? <Text style={styles.attachmentError}>{attachmentError}</Text> : null}
    </View>
  );
}

function StatusView({ loading, message }: { loading?: boolean; message?: string }) {
  const endpointHint = message === 'LLM API 地址格式无效'
    ? 'DeepSeek 示例：API 地址填 https://api.deepseek.com，模型填 deepseek-v4-flash-vision-exp。'
    : '请在设置中检查 LLM API 地址、模型和 API Key。';
  return (
    <View style={styles.status}>
      {loading ? <ActivityIndicator color={COLORS.primaryActive} /> : null}
      <Text style={styles.statusText}>{message ?? '正在加载 Prompt 助手…'}</Text>
      {!loading ? <Text style={styles.statusHint}>{endpointHint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // CopilotKit's rendered component owns its own light message/input theme.
  // Match that surface so its built-in empty state and tool UI keep contrast.
  chat: { flex: 1, backgroundColor: '#FFFFFF' },
  chatShell: { flex: 1, position: 'relative' },
  attachmentLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 },
  attachmentTray: { position: 'absolute', left: 12, right: 12, bottom: 196, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachmentPreview: { width: 52, height: 52, borderRadius: 8, overflow: 'visible', backgroundColor: '#E5E7EB' },
  attachmentImage: { width: 52, height: 52, borderRadius: 8 },
  attachmentRemove: { position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  attachmentRemoveText: { color: '#FFFFFF', fontSize: 17, lineHeight: 20 },
  attachmentButton: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  attachmentButtonText: { color: '#4338CA', fontSize: 28, lineHeight: 32 },
  attachmentError: { position: 'absolute', left: 12, right: 12, bottom: 256, padding: 8, borderRadius: 8, color: '#991B1B', backgroundColor: '#FEE2E2', fontSize: 12 },
  runtimeError: { position: 'absolute', left: 12, right: 12, bottom: 206, zIndex: 20, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' },
  runtimeErrorTitle: { color: '#991B1B', fontSize: 13, fontWeight: '700' },
  runtimeErrorText: { marginTop: 3, color: '#7F1D1D', fontSize: 12 },
  runtimeErrorDismiss: { marginTop: 6, color: '#4338CA', fontSize: 12, fontWeight: '600' },
  readyRoot: { flex: 1, backgroundColor: '#FFFFFF' },
  sessionBar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0', backgroundColor: '#FFFFFF' },
  sessionPickerButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sessionBarLabel: { color: '#6B7280', fontSize: 12 },
  sessionBarTitle: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '600' },
  sessionBarCount: { color: '#6B7280', fontSize: 12 },
  sessionChevron: { color: '#4F46E5', fontSize: 22, lineHeight: 22 },
  newSessionSmall: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: '#4F46E5' },
  newSessionSmallText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  sessionModal: { maxHeight: '72%', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#FFFFFF' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: '#111827', fontSize: 20, fontWeight: '700' },
  modalClose: { color: '#6B7280', fontSize: 30, lineHeight: 30 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, padding: 10, borderRadius: 10, backgroundColor: '#F3F4F6' },
  sessionRowActive: { borderWidth: 1, borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  sessionSelect: { flex: 1, minWidth: 0 },
  sessionName: { color: '#111827', fontSize: 15, fontWeight: '600' },
  sessionMeta: { marginTop: 3, color: '#6B7280', fontSize: 12 },
  deleteText: { padding: 8, color: '#B91C1C', fontSize: 12 },
  emptySessions: { padding: 24, color: '#6B7280', textAlign: 'center' },
  newSessionButton: { marginTop: 12, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: '#4F46E5' },
  newSessionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: COLORS.background },
  statusText: { color: COLORS.text, fontSize: 16, textAlign: 'center' },
  statusHint: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
});
