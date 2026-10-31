import { SkillLibraryScreen } from './skills/SkillLibraryScreen';
import {ListAction} from '../ui/ListPageUI';
import {AssistantActions} from '../creative/AssistantActions';
import { createAgentRuntimeAdapter } from './agentRuntimeAdapter';
import { CopilotChat } from '@copilotkit/react-native';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDatabase } from '../storage/databaseClient';
import { useFocusEffect, useRouter } from 'expo-router';
import { readSettings } from '../settings/storage';
import { COLORS } from '../ui/theme';
import { LocalCopilotKitProvider } from './LocalCopilotKitProvider';
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
import { createPromptDraftStore } from '../handoff/promptDraft';
import { sortSessionSnapshots } from './agentPresentation';
import type { PromptHandoff } from '../handoff/promptHandoff';
import { chooseWorkflow, readSelectedWorkflow } from '../workflows/registry/selection';
import { workflowCatalogEvents } from '../workflows/registry/catalogEvents';
import type { WorkflowChoice } from './PromptVersionPanel';
import { normalizePromptHandoffParameters } from '../handoff/promptHandoff';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import { registryRecordToDefinition } from '../workflows/registry/catalog';
import type { RegistryRecord } from '../workflows/registry/types';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { AgentCreativeCards, AgentActivityProvider } from '../creative/AgentCreativeCards';
import { AgentCreativePanel } from '../creative/AgentCreativePanel';
import { bindProjectConversation } from '../creative/projectAgentScope';

type AgentConfig = H3AgentConfig;
type ShotFocus = {shotId:string;title:string};

export default function AgentScreen({ projectId, focus }: {projectId?:string;focus?:ShotFocus} = {}) {
  const [persistenceIssue, setPersistenceIssue] = useState<string>();
  useEffect(() => {
    let mounted = true;
    const report = (reason: unknown) => { if (mounted) setPersistenceIssue(reason instanceof Error ? reason.message : '会话保存失败'); else console.error('Prompt session persistence failed', reason); };
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void promptRuntimeRegistry.flushAll().then(() => { if (mounted) setPersistenceIssue(undefined); }).catch(report);
    });
    return () => { mounted = false; subscription.remove(); void promptRuntimeRegistry.flushAll().catch(report); };
  }, []);
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
      key={`${config.endpoint}\u0000${config.model}\u0000${config.apiKey}\u0000${config.timeoutMs}\u0000${config.maxRetries}`}
      config={config}
      projectId={projectId}
      focus={focus}
      persistenceIssue={persistenceIssue}
    />
  );
}

function ReadyAgent({
  config,
  persistenceIssue,
  projectId,
  focus,
}: {
  config: AgentConfig;
  persistenceIssue?: string;
  projectId?:string;
  focus?:ShotFocus;
}) {
  const [operationIssue, onError] = useState<string>();
  const router = useRouter();
  const catalog = useMemo(() => createAppWorkflowCatalog(), []);
  const [workflow, setWorkflow] = useState<{ record: RegistryRecord; definition: WorkflowDefinition }>();
  const [workflows, setWorkflows] = useState<WorkflowChoice[]>([]);
  const [workflowLoadIssue, setWorkflowLoadIssue] = useState<string>();
  const [workflowReload, setWorkflowReload] = useState(0);
  useEffect(() => workflowCatalogEvents.subscribe(() => setWorkflowReload(value => value + 1)), []);
  useFocusEffect(useCallback(() => {
    let current = true;
    setWorkflowLoadIssue(undefined);
    void (async () => {
      await catalog.bootstrap();
      const records = await catalog.listActive();
      const record = chooseWorkflow(records, await readSelectedWorkflow().catch(() => null));
      if (!record) throw new Error('没有可用工作流');
      const definition = registryRecordToDefinition(record);
      if (current) { setWorkflow({ record, definition }); setWorkflows(records.map(item => ({ definition: registryRecordToDefinition(item), contentHash: item.contentHash }))); }
    })().catch(reason => { if (current) setWorkflowLoadIssue(reason instanceof Error ? reason.message : '工作流加载失败'); });
    return () => { current = false; };
  }, [catalog, workflowReload]));
  const requireCurrentWorkflow = async (target?: PromptHandoff['target']) => {
    if (!workflow) throw new Error('工作流尚未就绪，请重新加载后重试');
    const current = await catalog.getActive(target?.workflowId ?? workflow.record.workflowId);
    if (!current || current.version !== (target?.workflowVersion ?? workflow.record.version) || current.contentHash !== (target?.contentHash ?? workflow.record.contentHash)) {
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
      .then(() => threadStore.listSummaries({ limit: 50, projectId }))
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
        return threadStore.save(initial).then(async () => {
          if (projectId) await bindProjectConversation(getDatabase(), initial.threadId, projectId);
          if (active) {
            setThreads([initial]);
            setActiveThreadId(initial.threadId);
          }
        });
      })
      .catch((reason) => {
        if (active)
          setLoadIssue(
            reason instanceof Error ? reason.message : '无法恢复本地助手会话',
          );
      });
    return () => {
      active = false;
    };
  }, [threadStore, onError, projectId]);
  const createSession = useCallback(async () => {
    onError(undefined);
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
      const scope=projectId&&activeThreadId?await getDatabase().getFirstAsync<{project_id:string|null}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',activeThreadId):null;
      const target=scope?scope.project_id:projectId;
      if(target)await bindProjectConversation(getDatabase(),snapshot.threadId,target);
      setThreads((current) => sortSessionSnapshots([snapshot, ...current]));
      setActiveThreadId(snapshot.threadId);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '创建会话失败');
    }
  }, [onError, threadStore, projectId,activeThreadId]);
  const deleteSession = useCallback(
    async (threadId: string) => {
      onError(undefined);
      try {
        await promptRuntimeRegistry.evictThread(threadId);
        await threadStore.remove(threadId);
        const next = await threadStore.listSummaries({ limit: 50, projectId });
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
    [createSession, onError, threadStore, projectId],
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
        throw reason;
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
  }, [threadStore, threads.length, projectId]);
  if (loadIssue) return <ScrollView style={{ flex: 1, padding: 20, backgroundColor: COLORS.background }}>
    <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{operationIssue ?? loadIssue}</Text>
    <Pressable accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }} onPress={createSession}><Text style={{ color: COLORS.primaryActive }}>新建对话</Text></Pressable>
    {threads.map(thread => <Pressable accessibilityRole="button" key={thread.threadId} style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => setActiveThreadId(thread.threadId)}><Text style={{ color: COLORS.text }}>{thread.customTitle ?? thread.summary?.title ?? '未命名对话'}</Text></Pressable>)}
  </ScrollView>;
  if (!activeSnapshot || activeSnapshot.threadId !== activeThreadId) return <StatusView loading message="正在准备本地助手会话…" />;
  return (
    <AgentSession
      key={activeSnapshot.threadId}
      config={config}
      snapshot={activeSnapshot}
      focus={focus}
      workflowDefinition={workflow?.definition}
      workflows={workflows}
      workflowLoadIssue={workflowLoadIssue}
      onReloadWorkflow={() => setWorkflowReload(value => value + 1)}
      operationIssue={operationIssue}
      persistenceIssue={persistenceIssue}
      threadStore={threadStore}
      threads={threads}
      activeThreadId={activeSnapshot.threadId}
      onSelect={(id) => setActiveThreadId(id)}
      onNew={createSession}
      onDelete={deleteSession}
      onRename={renameSession}
      onSearchHistory={query => searchHistory(query)}
      onLoadMoreHistory={hasMoreThreads ? () => searchHistory(historyQuery, true) : undefined}
      onExportPrompt={async (prompt) => {
        await requireCurrentWorkflow();
        const draft = await draftStore.save({ prompt, attachmentIds: [] });
        router.navigate({
          pathname: '/(tabs)/create',
          params: { draftId: draft.id },
        });
      }}
      onExportHandoff={async (handoff) => {
        const definition = await requireCurrentWorkflow(handoff.target);
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
  operationIssue,
  persistenceIssue,
  focus,
  ...uiProps
}: {
  config: AgentConfig;
  snapshot: LocalThreadSnapshot;
  focus?:ShotFocus;
  workflowDefinition?: WorkflowDefinition;
  workflows?: WorkflowChoice[];
  workflowLoadIssue?: string;
  onReloadWorkflow: () => void;
  operationIssue?: string;
  persistenceIssue?: string;
  threadStore: LocalThreadStore;
  threads: LocalThreadSnapshot[];
  activeThreadId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onSearchHistory?: (query: string) => void | Promise<void>;
  onLoadMoreHistory?: () => void | Promise<void>;
  onExportPrompt: (prompt: string) => Promise<void>;
  onExportHandoff: (handoff: PromptHandoff) => Promise<void>;
}) {
  const [notice, setNotice] = useState<string | undefined>();
  const [skillsOpen,setSkillsOpen]=useState(false);
  const [focusDismissed,setFocusDismissed]=useState(false);
  useEffect(()=>setFocusDismissed(false),[focus?.shotId]);
  const skillGuard=useRef<((proceed:()=>void)=>void)|undefined>(undefined);
  const registerSkillGuard=useCallback((guard:((proceed:()=>void)=>void)|undefined)=>{skillGuard.current=guard;},[]);
  const leaveSkills=(proceed:()=>void)=>skillGuard.current?skillGuard.current(proceed):proceed();
  const [runIssue, setRunIssue] = useState<RunIssue | null>(null);
  const runtime = useMemo(
    () => promptRuntimeRegistry.ensure(config, snapshot, threadStore),
    [config, snapshot.threadId, threadStore],
  );
  const adapter = useMemo(() => createAgentRuntimeAdapter(runtime), [runtime]);
  const agent = runtime.agent;
  const liveSnapshot = useSyncExternalStore(runtime.subscribeView, runtime.getViewSnapshot, runtime.getViewSnapshot);
  const [isVisible, setVisible] = useState(false);
  useFocusEffect(useCallback(() => {
    setVisible(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => setVisible(state === 'active'));
    return () => { subscription.remove(); setVisible(false); };
  }, []));
  useEffect(() => {
    const unsubscribe = adapter.subscribe((event) => {
      if (event.type === 'error') setNotice(event.message);
    });
    return unsubscribe;
  }, [adapter]);
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
        <AgentActivityProvider threadId={snapshot.threadId}><PromptAssistantUi
          {...uiProps}
          onNew={()=>leaveSkills(uiProps.onNew)}
          onSelect={id=>leaveSkills(()=>uiProps.onSelect(id))}
          onDelete={id=>leaveSkills(()=>uiProps.onDelete(id))}
          headerActions={<AssistantActions onOpenSkills={()=>setSkillsOpen(true)}/>}
          toolPanel={skillsOpen?<SkillLibraryScreen threadId={snapshot.threadId} registerLeave={registerSkillGuard} onClose={()=>setSkillsOpen(false)}/>:undefined}
          headerContext={<View><AgentCreativePanel beforeNavigate={leaveSkills} compact threadId={snapshot.threadId} running={Boolean(agent.isRunning)} />{focus&&!focusDismissed?<View style={{paddingHorizontal:16,paddingBottom:8}}><Text style={{color:COLORS.text}}>当前镜头：{focus.title}</Text><Text style={{color:COLORS.textMuted}}>发送时核对并固定镜头版本</Text><Pressable accessibilityRole="button" accessibilityLabel="移除镜头上下文" onPress={()=>setFocusDismissed(true)} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:COLORS.primaryActive}}>移除镜头上下文</Text></Pressable></View>:null}</View>}
          renderRunArtifacts={runId=><AgentCreativeCards threadId={snapshot.threadId} running={Boolean(agent.isRunning)} runId={runId}/>}
          onExportPrompt={onExportPrompt}
          onExportHandoff={onExportHandoff}
          clientState={liveSnapshot.state as Record<string, unknown>}
          transcript={liveSnapshot.messages}
          transcriptRevision={liveSnapshot.transcriptRevision}
          onClientStateChange={runtime.patchClientState}
          isVisible={isVisible}
          persistentNotice={Boolean(persistenceIssue)} notice={persistenceIssue ?? operationIssue ?? notice}
          runIssue={runIssue}
          onRunIssueChange={setRunIssue}
          onCancel={adapter.cancel}
          onAccept={async input => {
            const runId = createAgentId();
            const handle = await adapter.start({ id: input.id, runId, focusShotId:focusDismissed?undefined:focus?.shotId, draftRevision: input.draftRevision, message: { id: `user-${input.id}`, role: 'user', content: input.text, attachments: input.attachments } as never });
            void handle.completion.catch(reason => setRunIssue({ kind: 'error', runId, message: reason instanceof Error ? reason.message : '运行失败' }));
          }}
          onRetry={async (runId) => {
            setRunIssue(null);
            try {
              const handle = await adapter.retry(runId);
              await handle.completion;
            } catch (reason) {
              setRunIssue({
                kind: 'error',
                message: reason instanceof Error ? reason.message : '重试失败',
              });
            }
          }}
        /></AgentActivityProvider>
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
      {!loading?<View style={{position:'absolute',top:4,right:8,flexDirection:'row'}}><AssistantActions/></View>:null}
      {loading ? <ActivityIndicator color={COLORS.primaryActive} /> : null}
      <Text style={styles.statusText}>
        {message ?? '正在加载 Prompt 助手…'}
      </Text>
      {!loading ? (
        <ListAction label="打开 LLM 设置" icon="settings" onPress={()=>router.navigate({pathname:'/settings-panel',params:{section:'assistant'}})}/>
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
