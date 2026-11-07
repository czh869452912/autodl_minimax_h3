import {SkillRunHistory} from './SkillRunHistory';
import {runEvents} from '../runEvents';
import {skillSelectionEvents} from './selectionEvents';
import {builtinSkillCatalog} from './builtinCatalog';
import {selectNextRunSkills,readNextRunSkills} from './nextRun';
import { useUnsavedChanges } from '../../creative/useUnsavedChanges';
import { usePrimaryNavigationGuard } from '../../navigation/PrimaryNavigation';
import { CompactWorkbench, IconAction } from '../../creative/WorkbenchUI';
import { COLORS } from '../../ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Modal, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../storage/databaseClient';
import { createSkillStore, type SkillVersion } from './store';
import { SkillAddFlow, type SkillAddStatus } from './SkillAddFlow';
import { ListAction } from '../../ui/ListPageUI';
import { creativeUI as s } from '../../creative/creativeUI';
import { useFallbackBack } from '../../navigation/useFallbackBack';

export function SkillLibraryScreen({ onClose, registerLeave, intent, projectId: requestedProjectId, threadId, returnThreadId,initialVersionId }: { initialVersionId?:string; threadId?:string; returnThreadId?:string; projectId?:string; intent?:string; onClose?: () => void; registerLeave?:(guard:((proceed:()=>void)=>void)|undefined)=>void } = {}) {
  const router = useRouter();
  const builtins=useMemo(builtinSkillCatalog,[]);
  const [projectId,setProjectId]=useState(requestedProjectId);
  const [scopeReady,setScopeReady]=useState(!threadId);
  const store = useMemo(() => createSkillStore(getDatabase()), []);
  const [savedOnce,setSavedOnce]=useState<Awaited<ReturnType<typeof readNextRunSkills>>>(null);
  const [once,setOnce]=useState<string[]|null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof store.runs>>>([]);
  const [historyScope,setHistoryScope]=useState<'current'|'all'>('current');
  const [historyAfter,setHistoryAfter]=useState<{createdAt:number;threadId:string;runId:string}>();
  const [addStatus,setAddStatus]=useState<SkillAddStatus>({dirty:false,busy:false});
  const [highlighted,setHighlighted]=useState<string|undefined>(initialVersionId);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [importOpen,setImportOpen]=useState(intent==='add'),[historyOpen,setHistoryOpen]=useState(intent==='history'),[expanded,setExpanded]=useState<string|undefined>(initialVersionId),[query,setQuery]=useState('');
  const [rawOpen,setRawOpen]=useState(false);
  const scroll=useRef<ScrollView>(null);
  const [filter,setFilter]=useState<'all'|'local'|'builtin'|'selected'>('all');
  const lock = useRef(false);
  const confirmLeave=useUnsavedChanges(once!==null || addStatus.dirty,busy || addStatus.busy);
  usePrimaryNavigationGuard('agent',confirmLeave,Boolean(onClose));
  const latestLeave=useRef(confirmLeave);latestLeave.current=confirmLeave;
  useEffect(()=>{registerLeave?.(proceed=>latestLeave.current(proceed));return()=>registerLeave?.(undefined);},[registerLeave]);
  const back=()=>confirmLeave(()=>onClose?onClose():router.canGoBack()?router.back():router.replace('/(tabs)/agent'));
  useFallbackBack(()=>expanded?setExpanded(undefined):historyOpen&&intent!=='history'?setHistoryOpen(false):back());
  const readGeneration=useRef(0);
  const refresh = useCallback(async (background = false) => {
    const generation = ++readGeneration.current;
    if (!background) setScopeReady(false);
    const scope = threadId ? await getDatabase().getFirstAsync<{project_id:string|null}>(
      'SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId) : undefined;
    if (threadId && !scope) throw Error('会话范围不可用，请返回后重试');
    const effective = scope ? scope.project_id ?? undefined : requestedProjectId;
    const [items, history, pending] = await Promise.all([
      effective ? store.projectList(effective) : store.list(),
      store.runs({...((historyScope === 'all') ? {} : threadId ? {threadId} : {projectId:effective}), after:historyAfter, limit:21}),
      threadId ? readNextRunSkills(getDatabase(), threadId) : Promise.resolve(null),
    ]);
    // A newer read or a changed/unmounted panel supersedes this result.
    if (generation !== readGeneration.current) return;
    setSavedOnce(pending);
    setProjectId(effective);
    setVersions(items);
    setRuns(history);
    setScopeReady(true);
  }, [store, requestedProjectId, threadId, historyScope, historyAfter]);
  useFocusEffect(useCallback(() => { void refresh(true).catch(error => setNotice(String(error.message))); }, [refresh]));
  useEffect(() => {
    const unsubscribe = skillSelectionEvents.subscribe(changed => {
      // Refresh committed state, leaving the user's unsaved `once` draft intact.
      if (changed === threadId) void refresh(true).catch(error => setNotice('技能状态刷新失败，请重新打开面板：' + error.message));
    });
    const unsubscribeRuns = runEvents.subscribe(event => {
      if (historyScope === 'all' || !threadId || event.threadId === threadId) {
        void refresh(true).catch(error => setNotice('运行记录刷新失败：' + error.message));
      }
    });
    return () => { unsubscribe(); unsubscribeRuns(); readGeneration.current++; };
  }, [threadId, historyScope, refresh]);
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await work(); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  if(!scopeReady)return <View><Text>{notice||'正在核对会话技能范围…'}</Text><ListAction label="返回" onPress={back}/></View>;
  if(importOpen && !onClose)return <CompactWorkbench><SafeAreaView style={s.screen}><SkillAddFlow projectId={projectId} threadId={threadId??returnThreadId} onStatus={setAddStatus}
    onCancel={()=>confirmLeave(()=>{setImportOpen(false);setAddStatus({dirty:false,busy:false});})} onReturn={back}
    onDone={id=>{setImportOpen(false);setAddStatus({dirty:false,busy:false});setHighlighted(id);setExpanded(id);setFilter('local');setQuery('');setHistoryOpen(false);setNotice('版本已安装，默认选择保持原样。');void refresh(true).catch(()=>setNotice('已安装，但目录刷新失败，请返回后重新打开。'));scroll.current?.scrollTo({y:0,animated:false});}}/></SafeAreaView></CompactWorkbench>;
  if(historyOpen){
    const closeHistory=()=>intent==='history'?back():setHistoryOpen(false);
    const scope=historyScope==='all'||(!threadId&&!projectId)?'全部范围':threadId?'本会话':'本项目';
    const history=<View style={{flex:1}}><View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:COLORS.border}}><IconAction label="返回来源" icon="arrow_back" onPress={closeHistory}/><Text accessibilityRole="header" style={s.title}>{`${scope==='本会话'?'会话':scope==='本项目'?'项目':'全部'}技能运行记录`}</Text></View><ScrollView contentContainerStyle={{padding:16,gap:12}}>{notice?<Text accessibilityRole="alert">{notice}</Text>:null}<SkillRunHistory runs={runs} scope={scope} canChangeScope={Boolean(threadId||projectId)} onChangeScope={()=>{setHistoryScope(value=>value==='all'?'current':'all');setHistoryAfter(undefined);}} onOpen={(threadId,runId)=>confirmLeave(()=>router.push({pathname:'/agent-run',params:{threadId,runId}}))} onOlder={runs.length>20?()=>{const last=runs[19];setHistoryAfter({createdAt:last.createdAt,threadId:last.threadId,runId:last.runId});}:undefined} onLatest={historyAfter?()=>setHistoryAfter(undefined):undefined}/></ScrollView></View>;
    return <CompactWorkbench>{onClose?history:<SafeAreaView style={s.screen}>{history}</SafeAreaView>}</CompactWorkbench>;
  }
  const orderedVersions=highlighted?[...versions.filter(v=>v.id===highlighted),...versions.filter(v=>v.id!==highlighted)]:versions;
  const body = <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:6,borderBottomWidth:1,borderColor:COLORS.border}}>
      <IconAction label={onClose ? '关闭技能' : '返回'} icon={onClose ? 'close' : 'arrow_back'} onPress={back}/>
      <Text accessibilityRole="header" style={{flex:1,fontSize:16,fontWeight:'600',color:COLORS.text}}>技能管理</Text>
      <IconAction label="添加技能" icon="add" onPress={()=>{if(onClose){confirmLeave(()=>{onClose();router.push({pathname:'/agent-skills',params:{intent:'add',projectId,threadId}});});}else {setHistoryOpen(false);setImportOpen(true);scroll.current?.scrollTo({y:0,animated:false});}}}/>
      <IconAction label="技能运行记录" icon="history" selected={historyOpen} onPress={()=>{void refresh(true).catch(error=>setNotice('运行记录刷新失败：'+error.message));setHistoryOpen(true);}}/>
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:10}}>
      {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}

      {!historyOpen?<>
      <Text style={s.muted}>{projectId?'此项目默认 · 未单独设置时继承全局':'全局默认 · 适用于未覆盖的项目'}</Text>
      <TextInput accessibilityLabel="搜索技能" placeholder="搜索名称或用途" value={query} onChangeText={setQuery} style={s.input}/>
      <View accessibilityRole="radiogroup" accessibilityLabel="技能分类" style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{(['all','local','builtin','selected'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:filter===value}} accessibilityLabel={{all:'全部技能',local:'本地导入',builtin:'内置技能',selected:'当前启用'}[value]} onPress={()=>setFilter(value)} style={{minHeight:48,padding:10,borderRadius:8,backgroundColor:filter===value?COLORS.primarySoft:'transparent'}}><Text style={[s.body,{color:filter===value?COLORS.primaryActive:COLORS.textMuted}]}>{{all:'全部',local:'本地导入',builtin:'内置',selected:'当前启用'}[value]}</Text></Pressable>)}</View>
      {projectId?<ListAction label="打开全局技能管理" secondary onPress={()=>confirmLeave(()=>router.push('/agent-skills'))}/>:null}
      {!versions.length ? <Text style={s.muted}>还没有本地技能，点击右上角 + 导入。内置技能随应用提供。</Text> : null}
      {orderedVersions.filter(v=>filter!=='builtin'&&(filter!=='selected'||v.enabled)).filter(v=>`${v.name} ${v.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(version=><View key={version.id} style={[s.card,{padding:10,gap:8}]}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${version.name} ${version.id.slice(0,8)}`} accessibilityState={{expanded:expanded===version.id}} onPress={()=>{setRawOpen(false);setExpanded(version.id);}} style={{flex:1,minHeight:44,justifyContent:'center',gap:3}}>
            {version.id===highlighted?<Text style={s.muted}>{initialVersionId===version.id?'当前发布版本':'刚安装的版本'}</Text>:null}<Text style={s.title}>{version.name}</Text><Text numberOfLines={expanded===version.id?undefined:2} style={{fontSize:13,lineHeight:18,color:COLORS.textMuted}}>{version.description}</Text>
            <Text style={{fontSize:12,color:COLORS.textMuted}}>{projectId?(version.projectOverride?'此项目单独设置':'继承全局默认'):'全局默认'} · 查看详情</Text>
          </Pressable>
          {projectId&&version.projectOverride?<ListAction label="恢复全局选择" secondary disabled={busy} onPress={()=>void run(()=>store.setProjectVersion(projectId,version.name,undefined))}/>:null}
          <Switch accessibilityLabel={`${projectId?'项目默认':'全局启用'} ${version.name} ${version.id.slice(0,8)}`} disabled={busy} value={version.enabled} onValueChange={enabled=>{
            const apply=()=>void run(async()=>{if(projectId){await store.setProjectVersion(projectId,version.name,enabled?version.id:null);setNotice('已更新项目技能，仅影响新运行；已有运行保持版本快照。');}else{if(enabled) await store.enable(version.id);else await store.revoke(version.id);setNotice(enabled?'已启用，将用于新运行。':'已停用，相关运行已请求停止。');}});
            if(!projectId&&!enabled)Alert.alert('全局停用此技能版本？',`将撤销 ${version.name}，并请求停止使用此版本的相关运行。项目默认与已固定的单次选择也可能受影响。`,[{text:'取消',style:'cancel'},{text:'全局停用',style:'destructive',onPress:apply}]);else apply();
          }}/>
        </View>
        {once?<ListAction label={(once.includes(version.id)?'✓ ':'')+'本次选用 '+version.name} secondary disabled={busy} onPress={()=>setOnce(ids=>ids?.includes(version.id)?ids.filter(id=>id!==version.id):(ids?.length??0)<8?[...(ids??[]),version.id]:ids)}/>:null}
      </View>)}

      {(filter==='all'||filter==='builtin')?builtins.filter(v=>`${v.name} ${v.displayName} ${v.summary} ${v.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(v=><View key={v.path} style={[s.card,{padding:12}]}><Pressable accessibilityRole="button" accessibilityLabel={'内置：'+v.displayName} accessibilityState={{expanded:expanded===v.path}} onPress={()=>{setRawOpen(false);setExpanded(v.path);}} style={{minHeight:48,gap:6}}><Text style={s.title}>{v.displayName}</Text><Text numberOfLines={2} style={s.body}>{v.summary}</Text><Text style={s.muted}>内置 · 只读 · 查看详情</Text></Pressable></View>):null}
      {threadId?<View style={s.card}><Text style={s.body}>只为此会话下一条消息选择技能，不改变全局或项目组合。</Text><Text style={s.muted}>{savedOnce?`${savedOnce.valid?'已固定，等待下一条消息消费':'已固定但已失效，请重新选择'}：${savedOnce.ids.length?savedOnce.ids.map(id=>versions.find(v=>v.id===id)?.name??id).join('、'):'仅内置技能'}`:'当前使用项目组合，没有单次覆盖'}</Text><ListAction label="选择下次运行技能" secondary disabled={busy} onPress={()=>setOnce(savedOnce?.ids??[])}/>{once?<><Text style={s.muted}>正在编辑，尚未保存 · 已选 {once.length}/8（空选表示仅内置技能）</Text><ListAction label="保存单次选择" disabled={busy} onPress={()=>void run(async()=>{await selectNextRunSkills(getDatabase(),threadId,once);setOnce(null);setNotice('已固定下一条消息的技能，发送时核对项目范围。');})}/></>:null}<ListAction label="取消单次覆盖，使用项目组合" secondary disabled={busy} onPress={()=>void run(async()=>{await selectNextRunSkills(getDatabase(),threadId,null);setOnce(null);setNotice('已恢复项目组合');})}/></View>:null}
      </>:null}
    </ScrollView>
  </KeyboardAvoidingView>;
  const local=versions.find(v=>v.id===expanded),builtin=builtins.find(v=>v.path===expanded);
  return <CompactWorkbench>{onClose ? body : <SafeAreaView style={s.screen}>{body}</SafeAreaView>}{expanded&&(local||builtin)?<Modal visible animationType="slide" onRequestClose={()=>setExpanded(undefined)}><SafeAreaView style={s.screen} accessibilityViewIsModal>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:COLORS.border}}><IconAction label="返回技能目录" icon="arrow_back" onPress={()=>setExpanded(undefined)}/><Text accessibilityRole="header" style={s.title}>技能详情</Text></View>
    <ScrollView contentContainerStyle={{padding:16,gap:16}}>
      {local&&local.id===highlighted?<Text style={s.muted}>{initialVersionId===local.id?'当前发布版本':'刚安装的版本'}</Text>:null}
      <Text accessibilityRole="header" style={s.title}>{builtin?.displayName??local?.name}</Text>
      <Text style={s.body}>{builtin?.localizedDescription??local?.description}</Text>
      <Text style={s.muted}>{builtin?'内置 · '+builtin.version+' · 所有项目可发现。实际读取以运行记录为准；指令不会授予工具或外发权限。':projectId?'此项目默认；未单独设置时继承全局。已有运行保持固定版本。':'本地导入 · 全局默认。停用会撤销版本，并请求停止使用此版本的相关运行。'}</Text>
      {local?.capabilities?<View style={s.card}><Text style={s.title}>输入与输出</Text><Text style={s.body}>输入：{local.capabilities.inputs.join('、')}{'\n'}输出：{local.capabilities.output}{'\n'}需要工具：{local.capabilities.tools.join('、')||'无'}（声明不授予权限）</Text></View>:null}
      <ListAction label={rawOpen?'收起原始文件与版本':'查看原始文件与版本'} secondary onPress={()=>setRawOpen(!rawOpen)}/>
      {rawOpen?<><Text selectable style={s.muted}>{builtin?'包指纹 '+builtin.fingerprint:'版本 '+local?.id}</Text>{Object.entries(builtin?.files??local?.files??{}).map(([path,body])=><View key={path} style={{gap:8}}><Text style={s.title}>{path}</Text><Text selectable style={s.body}>{body}</Text></View>)}</>:null}
    </ScrollView>
  </SafeAreaView></Modal>:null}</CompactWorkbench>;
}
