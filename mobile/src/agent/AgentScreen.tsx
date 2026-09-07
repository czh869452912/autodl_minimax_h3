import { CopilotChat } from '@copilotkit/react-native';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDatabase } from '../storage/databaseClient';
import { useFocusEffect, useRouter } from 'expo-router';
import { readSettings } from '../settings/storage';
import { COLORS } from '../ui/theme';
import { LocalCopilotKitProvider, createLocalCopilotKitCore } from './LocalCopilotKitProvider';
import { createAgentId } from './submissionCommands';
import { promptRuntimeRegistry } from './runtimeStore';
import {
  createLocalThreadStore,
  type LocalThreadSnapshot,
  type LocalThreadStore,
} from './threadStore';
import { isH3AgentConfigReady, type H3AgentConfig } from './agentTypes';
import { applyAgentSettings } from './agentConfig';
import { getH3AgentConfigError } from './modelAdapter';
import { PromptAssistantUi, type RunIssue } from './PromptAssistantUi';
import { createPromptDraftStore } from './promptDraft';
import { sortSessionSnapshots } from './agentPresentation';
import type { PromptHandoff } from './promptHandoff';
import { normalizePromptHandoffParameters } from './promptHandoff';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import { registryRecordToDefinition } from '../workflows/registry/catalog';
import type { RegistryRecord } from '../workflows/registry/types';
import type { WorkflowDefinition } from '../workflows/schema/types';

type AgentConfig = H3AgentConfig;

export default function AgentScreen() {
  const [persistenceIssue, setPersistenceIssue] = useState<string>();
  useEffect(() => {
    let mounted = true;
    const report = (reason: unknown) => { if (mounted) setPersistenceIssue(reason instanceof Error ? reason.message : '会话保存失败'); else console.error('Prompt session persistence failed', reason); };
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void promptRuntimeRegistry.flushAll().catch(report);
    });
    return () => { mounted = false; subscription.remove(); void promptRuntimeRegistry.disposeAll().catch(report); };
  }, []);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeAvailable = Boolean(
    !error
      && config
      && isH3AgentConfigReady(config)
      && !getH3AgentConfigError(config),
  );
  useEffect(() => {
    let current = true;
    if (!runtimeAvailable) void promptRuntimeRegistry.disposeAll().catch(reason => { if (current) setPersistenceIssue(reason instanceof Error ? reason.message : '会话保存失败'); else console.error('Prompt session persistence failed', reason); });
    return () => { current = false; };
  }, [runtimeAvailable]);
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
      key={`${config.endpoint}\u0000${config.model}\u0000${config.apiKey}\u0000${config.timeoutMs}\u0000${config.maxRetries}`}
      config={config}
      onError={setError}
      persistenceIssue={persistenceIssue}
    />
  );
}

function ReadyAgent({
  config,
  onError,
  persistenceIssue,
}: {
  config: AgentConfig;
  onError: (message: string) => void;
  persistenceIssue?: string;
}) {
  const router = useRouter();
  const catalog = useMemo(() => createAppWorkflowCatalog(), []);
  const [workflow, setWorkflow] = useState<{ record: RegistryRecord; definition: WorkflowDefinition }>();
  const [workflowLoadIssue, setWorkflowLoadIssue] = useState<string>();
  const [workflowReload, setWorkflowReload] = useState(0);
  useFocusEffect(useCallback(() => {
    let current = true;
    setWorkflow(undefined); setWorkflowLoadIssue(undefined);
    void (async () => {
      await catalog.bootstrap();
      const record = (await catalog.listActive())[0];
      if (!record) throw new Error('没有可用工作流');
      const definition = registryRecordToDefinition(record);
      if (current) setWorkflow({ record, definition });
    })().catch(reason => { if (current) setWorkflowLoadIssue(reason instanceof Error ? reason.message : '工作流加载失败'); });
    return () => { current = false; };
  }, [catalog, workflowReload]));
  const requireCurrentWorkflow = async () => {
    if (!workflow) throw new Error('工作流尚未就绪，请重新加载后重试');
    const current = await catalog.getActive(workflow.record.workflowId);
    if (!current || current.version !== workflow.record.version || current.contentHash !== workflow.record.contentHash) {
      setWorkflow(undefined); setWorkflowLoadIssue('工作流已更新，请重新加载后确认生成参数');
      throw new Error('工作流已更新，请重新加载后确认生成参数');
    }
    return registryRecordToDefinition(current);
  };
  const threadStore = useMemo<LocalThreadStore>(
    () => createLocalThreadStore(getDatabase()),
    [],
  );
  const draftStore = useMemo(
    () => createPromptDraftStore(getDatabase()),
    [],
  );
  const [threads, setThreads] = useState<LocalThreadSnapshot[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<LocalThreadSnapshot | null>(null);
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const historyPage = useRef(0);
  useEffect(() => {
    let current = true;
    if (!activeThreadId) { setActiveSnapshot(null); return; }
    setLoadIssue(null);
    void threadStore.load(activeThreadId).then(snapshot => { if (current) setActiveSnapshot(snapshot); }).catch(reason => { if (current) { setActiveSnapshot(null); setLoadIssue(reason instanceof Error ? reason.message : '读取会话失败'); } });
    return () => { current = false; };
  }, [activeThreadId, threadStore, onError]);
  const renameSequence = useRef(0);
  const appliedRenames = useRef(new Map<string, number>());
  useEffect(() => {
    let active = true;
    void threadStore
      .recoverInterruptedRuns(promptRuntimeRegistry.liveThreadIds())
      .then(() => threadStore.listSummaries({ limit: 50 }))
      .then((snapshots) => {
        if (!active) return;
        setHasMoreThreads(snapshots.length === 50);
        if (snapshots.length) {
          const sorted = sortSessionSnapshots(snapshots);
          setThreads(sorted);
          setActiveThreadId((current) =>
            current && sorted.some((item) => item.threadId === current)
              ? current
              : sorted[0].threadId,
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
        return threadStore.save(initial).then(() => {
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
      setThreads((current) => sortSessionSnapshots([snapshot, ...current]));
      setActiveThreadId(snapshot.threadId);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '创建会话失败');
    }
  }, [onError, threadStore]);
  const deleteSession = useCallback(
    async (threadId: string) => {
      try {
        await promptRuntimeRegistry.evictThread(threadId);
        await threadStore.remove(threadId);
        const next = await threadStore.listSummaries({ limit: 50 });
        setThreads((current) => sortSessionSnapshots(next.map((snapshot) =>
          current.find((item) => item.threadId === snapshot.threadId) ?? snapshot,
        )));
        setActiveThreadId((current) =>
          current === threadId ? (next[0]?.threadId ?? null) : current,
        );
        if (!next.length) await createSession();
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : '删除会话失败');
      }
    },
    [createSession, onError, threadStore],
  );
  const renameSession = useCallback(
    async (threadId: string, title: string) => {
      const sequence = ++renameSequence.current;
      try {
        const metadata = await promptRuntimeRegistry.renameThread(threadId, title, threadStore);
        // A later successful rename wins even when an earlier flush finishes last.
        // Failed requests do not prevent a prior successful rename from applying.
        if (sequence < (appliedRenames.current.get(threadId) ?? 0)) return;
        appliedRenames.current.set(threadId, sequence);
        setThreads((items) => sortSessionSnapshots(
          items.map((item) => (item.threadId === threadId
            ? { ...item, ...metadata, updatedAt: Math.max(item.updatedAt, metadata.updatedAt) }
            : item)),
        ));
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : '重命名会话失败');
      }
    },
    [onError, threadStore],
  );
  const handleSnapshotChange = useCallback(
    (next: LocalThreadSnapshot) =>
      setThreads((items) => sortSessionSnapshots(
        items.map((item) => (item.threadId === next.threadId ? next : item)),
      )),
    [],
  );
  useEffect(() => promptRuntimeRegistry.subscribeSummary(handleSnapshotChange), [handleSnapshotChange]);
  const searchHistory = useCallback(async (query: string, more = false) => {
    const request = ++historyPage.current;
    const page = await threadStore.listSummaries({ query, limit: 50, offset: more ? threads.length : 0 });
    if (request !== historyPage.current) return;
    setHistoryQuery(query); setHasMoreThreads(page.length === 50);
    setThreads(current => more ? [...current, ...page.filter(row => !current.some(old => old.threadId === row.threadId))] : page);
  }, [threadStore, threads.length]);
  if (loadIssue) return <View style={{ flex: 1, padding: 20, backgroundColor: COLORS.background }}>
    <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{loadIssue}</Text>
    <Pressable accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }} onPress={createSession}><Text style={{ color: COLORS.primaryActive }}>新建对话</Text></Pressable>
    {threads.map(thread => <Pressable accessibilityRole="button" key={thread.threadId} style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => setActiveThreadId(thread.threadId)}><Text style={{ color: COLORS.text }}>{thread.customTitle ?? thread.summary?.title ?? thread.threadId}</Text></Pressable>)}
  </View>;
  if (!activeSnapshot || activeSnapshot.threadId !== activeThreadId) return <StatusView loading message="正在准备本地助手会话…" />;
  return (
    <AgentSession
      key={activeSnapshot.threadId}
      config={config}
      snapshot={activeSnapshot}
      workflowDefinition={workflow?.definition}
      workflowLoadIssue={workflowLoadIssue}
      onReloadWorkflow={() => setWorkflowReload(value => value + 1)}
      persistenceIssue={persistenceIssue}
      threadStore={threadStore}
      threads={threads}
      activeThreadId={activeSnapshot.threadId}
      onSelect={(id) => setActiveThreadId(id)}
      onNew={createSession}
      onDelete={deleteSession}
      onRename={renameSession}
      onSearchHistory={query => { void searchHistory(query).catch(reason => onError(String(reason))); }}
      onLoadMoreHistory={hasMoreThreads ? () => { void searchHistory(historyQuery, true).catch(reason => onError(String(reason))); } : undefined}
      onExportPrompt={async (prompt) => {
        await requireCurrentWorkflow();
        const draft = await draftStore.save({ prompt, attachmentIds: [] });
        router.navigate({
          pathname: '/(tabs)/create',
          params: { draftId: draft.id },
        });
      }}
      onExportHandoff={async (handoff) => {
        const definition = await requireCurrentWorkflow();
        handoff = { ...handoff, parameters: normalizePromptHandoffParameters(handoff.parameters, definition) };
        const draft = await draftStore.save({ prompt: handoff.prompt, attachmentIds: handoff.images.map(image => image.id), handoff });
        router.navigate({ pathname: '/(tabs)/create', params: { draftId: draft.id } });
      }}
    />
  );
}

function AgentSession({
  config,
  snapshot,
  threadStore,
  onExportPrompt,
  onExportHandoff,
  persistenceIssue,
  ...uiProps
}: {
  config: AgentConfig;
  snapshot: LocalThreadSnapshot;
  workflowDefinition?: WorkflowDefinition;
  workflowLoadIssue?: string;
  onReloadWorkflow: () => void;
  persistenceIssue?: string;
  threadStore: LocalThreadStore;
  threads: LocalThreadSnapshot[];
  activeThreadId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSearchHistory?: (query: string) => void;
  onLoadMoreHistory?: () => void;
  onExportPrompt: (prompt: string) => Promise<void>;
  onExportHandoff: (handoff: PromptHandoff) => Promise<void>;
}) {
  const [notice, setNotice] = useState<string | undefined>();
  const [runIssue, setRunIssue] = useState<RunIssue | null>(null);
  const runtime = useMemo(
    () => promptRuntimeRegistry.ensure(config, snapshot, threadStore),
    [config, snapshot.threadId, threadStore],
  );
  const agent = runtime.agent;
  const liveSnapshot = useSyncExternalStore(runtime.subscribeView, runtime.getViewSnapshot, runtime.getViewSnapshot);
  const [isVisible, setVisible] = useState(false);
  useFocusEffect(useCallback(() => {
    setVisible(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => setVisible(state === 'active'));
    return () => { subscription.remove(); setVisible(false); };
  }, []));
  useEffect(() => {
    const unsubscribe = runtime.subscribe((event) => {
      if (event.type === 'error') setNotice(event.message);
    });
    return unsubscribe;
  }, [runtime]);
  return (
    <LocalCopilotKitProvider
      agent={agent}
      onError={(reason) =>
        setRunIssue({ kind: 'error', message: reason.message })
      }
    >
      <CopilotChat
        agentId={agent.agentId}
        attachments={{ enabled: false }}
      >
        <PromptAssistantUi
          {...uiProps}
          onExportPrompt={onExportPrompt}
          onExportHandoff={onExportHandoff}
          clientState={liveSnapshot.state as Record<string, unknown>}
          transcript={liveSnapshot.messages}
          onClientStateChange={runtime.patchClientState}
          isVisible={isVisible}
          notice={persistenceIssue ?? notice}
          runIssue={runIssue}
          onRunIssueChange={setRunIssue}
          onAccept={async input => {
            const runId = createAgentId();
            const receipt = await runtime.accept({ id: input.id, runId, draftRevision: input.draftRevision, message: { id: `user-${input.id}`, role: 'user', content: input.text, attachments: input.attachments } as never });
            if (runtime.disposed() || receipt.executionReady === false) return;
            void createLocalCopilotKitCore(agent).runAgent({ agent, runId }).catch(reason => setRunIssue({ kind: 'error', runId, message: reason instanceof Error ? reason.message : '运行失败' }));
          }}
          onRetry={async (runId) => {
            setRunIssue(null);
            try {
              agent.prepareRetry(runId);
              const retry = agent.getPreparedRetry();
              const message = agent.messages.find(item => item.id === retry?.userMessageId);
              if (!message) throw new Error('没有可重试的用户消息');
              const nextRunId = createAgentId();
              const receipt = await runtime.accept({ id: createAgentId(), runId: nextRunId, draftRevision: -1, message, retryOf: retry?.retryOf });
              if (runtime.disposed() || receipt.executionReady === false) return;
              await createLocalCopilotKitCore(agent).runAgent({ agent, runId: nextRunId });
            } catch (reason) {
              setRunIssue({
                kind: 'error',
                message: reason instanceof Error ? reason.message : '重试失败',
              });
            }
          }}
        />
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
  const router = useRouter();
  return (
    <View style={styles.status}>
      {loading ? <ActivityIndicator color={COLORS.primaryActive} /> : null}
      <Text style={styles.statusText}>
        {message ?? '正在加载 Prompt 助手…'}
      </Text>
      {!loading ? (
        <Pressable accessibilityRole="button" accessibilityLabel="打开 LLM 设置" onPress={() => router.navigate('/(tabs)/settings')} style={{ minHeight: 48, padding: 12, justifyContent: 'center' }}><Text style={{ color: COLORS.primaryActive }}>打开设置</Text></Pressable>
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
