import { CopilotChat } from '@copilotkit/react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { readSettings } from '../settings/storage';
import { COLORS } from '../ui/theme';
import { createH3Agent } from './h3Agent';
import { LocalCopilotKitProvider } from './LocalCopilotKitProvider';
import { H3AgUiAgent } from './aguiAgent';
import {
  createLocalThreadStore,
  type LocalThreadSnapshot,
  type LocalThreadStore,
} from './threadStore';
import { isH3AgentConfigReady } from './agentTypes';
import { applyAgentSettings } from './agentConfig';
import { readImageAsDataSource } from './imageAttachmentUpload';
import { getH3AgentConfigError } from './modelAdapter';
import { PromptAssistantUi } from './PromptAssistantUi';
import { createPromptDraftStore } from './promptDraft';

type AgentConfig = { apiKey: string; endpoint: string; model: string };

export default function AgentScreen() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    let active = true;
    void readSettings()
      .then((settings) => {
        if (!active) return;
        try {
          const next = applyAgentSettings(
            { config: null, error: null },
            settings,
          );
          setConfig(next.config);
          setError(next.error);
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : '本地 Agent 配置无效',
          );
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : '无法读取 Agent 设置',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useFocusEffect(refresh);
  if (error) return <StatusView message={error} />;
  if (!config) return <StatusView loading />;
  if (!isH3AgentConfigReady(config))
    return <StatusView message="尚未配置完整的 LLM 设置" />;
  const configError = getH3AgentConfigError(config);
  if (configError)
    return (
      <StatusView
        message={
          configError === 'LLM API endpoint must be an HTTP(S) URL'
            ? 'LLM API 地址格式无效'
            : configError
        }
      />
    );
  return (
    <ReadyAgent
      key={`${config.endpoint}\u0000${config.model}\u0000${config.apiKey}`}
      config={config}
      onError={setError}
    />
  );
}

function ReadyAgent({
  config,
  onError,
}: {
  config: AgentConfig;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const threadStore = useMemo<LocalThreadStore>(
    () => createLocalThreadStore(openDatabaseSync('autodl-h3.db')),
    [],
  );
  const draftStore = useMemo(
    () => createPromptDraftStore(openDatabaseSync('autodl-h3.db')),
    [],
  );
  const [threads, setThreads] = useState<LocalThreadSnapshot[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void threadStore
      .list()
      .then((snapshots) => {
        if (!active) return;
        if (snapshots.length) {
          setThreads(snapshots);
          setActiveThreadId((current) =>
            current && snapshots.some((item) => item.threadId === current)
              ? current
              : snapshots[0].threadId,
          );
          return;
        }
        const now = Date.now();
        const initial: LocalThreadSnapshot = {
          threadId: `h3-${now}-${Math.random().toString(36).slice(2, 8)}`,
          messages: [],
          state: {},
          createdAt: now,
          updatedAt: now,
        };
        void threadStore.save(initial).then(() => {
          if (active) {
            setThreads([initial]);
            setActiveThreadId(initial.threadId);
          }
        });
      })
      .catch((reason) => {
        if (active)
          onError(
            reason instanceof Error ? reason.message : '无法恢复本地助手会话',
          );
      });
    return () => {
      active = false;
    };
  }, [threadStore, onError]);
  const createSession = useCallback(async () => {
    const now = Date.now();
    const snapshot: LocalThreadSnapshot = {
      threadId: `h3-${now}-${Math.random().toString(36).slice(2, 8)}`,
      messages: [],
      state: {},
      createdAt: now,
      updatedAt: now,
    };
    try {
      await threadStore.save(snapshot);
      setThreads((current) => [snapshot, ...current]);
      setActiveThreadId(snapshot.threadId);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '创建会话失败');
    }
  }, [onError, threadStore]);
  const deleteSession = useCallback(
    async (threadId: string) => {
      try {
        await threadStore.remove(threadId);
        const next = await threadStore.list();
        setThreads(next);
        setActiveThreadId((current) =>
          current === threadId ? (next[0]?.threadId ?? null) : current,
        );
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : '删除会话失败');
      }
    },
    [onError, threadStore],
  );
  const renameSession = useCallback(
    async (threadId: string, title: string) => {
      const current = threads.find((item) => item.threadId === threadId);
      if (!current) return;
      const next = { ...current, customTitle: title, updatedAt: Date.now() };
      try {
        await threadStore.save(next);
        setThreads((items) =>
          items.map((item) => (item.threadId === threadId ? next : item)),
        );
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : '重命名会话失败');
      }
    },
    [onError, threadStore, threads],
  );
  const handleSnapshotChange = useCallback(
    (next: LocalThreadSnapshot) =>
      setThreads((items) =>
        items.map((item) => (item.threadId === next.threadId ? next : item)),
      ),
    [],
  );
  const activeSnapshot = threads.find(
    (item) => item.threadId === activeThreadId,
  );
  if (!activeSnapshot) return <StatusView message="正在准备本地助手会话…" />;
  return (
    <AgentSession
      key={activeSnapshot.threadId}
      config={config}
      snapshot={activeSnapshot}
      threadStore={threadStore}
      onSnapshotChange={handleSnapshotChange}
      threads={threads}
      activeThreadId={activeSnapshot.threadId}
      onSelect={(id) => setActiveThreadId(id)}
      onNew={createSession}
      onDelete={deleteSession}
      onRename={renameSession}
      onExportPrompt={async (prompt) => {
        const draft = await draftStore.save({ prompt, attachmentIds: [] });
        router.navigate({
          pathname: '/(tabs)/create',
          params: { draftId: draft.id },
        });
      }}
    />
  );
}

function AgentSession({
  config,
  snapshot,
  threadStore,
  onSnapshotChange,
  onExportPrompt,
  ...uiProps
}: {
  config: AgentConfig;
  snapshot: LocalThreadSnapshot;
  threadStore: LocalThreadStore;
  onSnapshotChange: (snapshot: LocalThreadSnapshot) => void;
  threads: LocalThreadSnapshot[];
  activeThreadId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExportPrompt: (prompt: string) => Promise<void>;
}) {
  const [notice, setNotice] = useState<string | undefined>();
  const agent = useMemo(
    () => new H3AgUiAgent(createH3Agent(config) as never),
    [config, snapshot.threadId],
  );
  const initialSnapshot = useRef(snapshot);
  useEffect(() => {
    const initial = initialSnapshot.current;
    agent.threadId = initial.threadId;
    agent.setMessages(initial.messages);
    agent.setState(initial.state);
    let saveQueue = Promise.resolve();
    const subscription = agent.subscribe({
      onMessagesChanged: ({ messages, state }) => {
        const next = {
          threadId: agent.threadId,
          messages: [...messages] as never,
          state: { ...state },
          createdAt: initial.createdAt,
          updatedAt: Date.now(),
          customTitle: initial.customTitle,
        };
        onSnapshotChange(next);
        saveQueue = saveQueue
          .then(() => threadStore.save(next))
          .catch((reason) =>
            setNotice(
              reason instanceof Error
                ? `本地会话保存失败：${reason.message}`
                : '本地会话保存失败',
            ),
          );
      },
    });
    return () => subscription.unsubscribe();
  }, [agent, onSnapshotChange, threadStore]);
  return (
    <LocalCopilotKitProvider
      agent={agent}
      onError={(reason) => setNotice(reason.message)}
    >
      <CopilotChat
        agentId={agent.agentId}
        attachments={{
          enabled: true,
          accept: 'image/*',
          onUpload: readImageAsDataSource,
        }}
      >
        <PromptAssistantUi {...uiProps} onExportPrompt={onExportPrompt} notice={notice} />
      </CopilotChat>
    </LocalCopilotKitProvider>
  );
}

function StatusView({
  loading,
  message,
}: {
  loading?: boolean;
  message?: string;
}) {
  return (
    <View style={styles.status}>
      {loading ? <ActivityIndicator color={COLORS.primaryActive} /> : null}
      <Text style={styles.statusText}>
        {message ?? '正在加载 Prompt 助手…'}
      </Text>
      {!loading ? (
        <Text style={styles.statusHint}>
          请在设置中检查 LLM API 地址、模型和 API Key。
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: COLORS.background,
  },
  statusText: { color: COLORS.text, fontSize: 16, textAlign: 'center' },
  statusHint: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
});
