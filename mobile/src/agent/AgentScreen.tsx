import { CopilotChat } from '@copilotkit/react-native/components';
import { useAttachments } from '@copilotkit/react-native';
import { getSourceUrl } from '@copilotkit/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { readSettings } from '../settings/storage';
import { COLORS } from '../ui/theme';
import { createH3Agent } from './h3Agent';
import { LocalCopilotKitProvider } from './LocalCopilotKitProvider';
import { H3AgUiAgent } from './aguiAgent';
import { createLocalThreadStore, type LocalThreadStore } from './threadStore';
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
  const agent = useMemo(() => new H3AgUiAgent(createH3Agent(config) as never), [config]);
  const threadStore = useMemo<LocalThreadStore>(() => createLocalThreadStore(openDatabaseSync('autodl-h3.db')), []);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let active = true;
    hydratedRef.current = false;
    setHydrated(false);
    let createdAt = Date.now();
    let saveQueue = Promise.resolve();
    void threadStore.latest().then((snapshot) => {
      if (!active) return;
      if (snapshot) {
        createdAt = snapshot.createdAt;
        agent.threadId = snapshot.threadId;
        agent.setMessages(snapshot.messages);
        agent.setState(snapshot.state);
      }
      hydratedRef.current = true;
      setHydrated(true);
    }).catch((reason) => onError(reason instanceof Error ? reason.message : '无法恢复本地助手会话'));
    const subscription = agent.subscribe({
      onMessagesChanged: ({ messages, state }) => {
        if (!hydratedRef.current) return;
        const now = Date.now();
        saveQueue = saveQueue.then(() => threadStore.save({
          threadId: agent.threadId,
          messages: [...messages] as never,
          state: { ...state },
          createdAt,
          updatedAt: now,
        })).catch((reason) => onError(reason instanceof Error ? `本地会话保存失败：${reason.message}` : '本地会话保存失败'));
      },
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [agent, threadStore, onError]);

  if (!hydrated) return <StatusView loading message="正在恢复本地助手会话…" />;

  return (
    <LocalCopilotKitProvider agent={agent} onError={(runtimeError) => onError(runtimeError.message)}>
      <View style={styles.chatShell}>
        <CopilotChat
          agentName={agent.agentId}
          headerTitle="Prompt 助手"
          placeholder="描述你想生成的视频，助手会整理成 H3 Prompt…"
          emptyStateTitle="把想法交给 H3 Prompt 助手"
          emptyStateSubtitle="官方 H3 skills 与真实工具调用由本机 DeepAgents 处理。"
          style={styles.chat}
        />
        <AttachmentBridge agent={agent} />
      </View>
    </LocalCopilotKitProvider>
  );
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
  attachmentTray: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachmentPreview: { width: 52, height: 52, borderRadius: 8, overflow: 'visible', backgroundColor: '#E5E7EB' },
  attachmentImage: { width: 52, height: 52, borderRadius: 8 },
  attachmentRemove: { position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  attachmentRemoveText: { color: '#FFFFFF', fontSize: 17, lineHeight: 20 },
  attachmentButton: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  attachmentButtonText: { color: '#4338CA', fontSize: 28, lineHeight: 32 },
  attachmentError: { position: 'absolute', left: 12, right: 12, bottom: 76, padding: 8, borderRadius: 8, color: '#991B1B', backgroundColor: '#FEE2E2', fontSize: 12 },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: COLORS.background },
  statusText: { color: COLORS.text, fontSize: 16, textAlign: 'center' },
  statusHint: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
});
