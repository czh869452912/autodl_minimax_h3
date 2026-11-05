import {RUN_LABELS} from '../../conversation/activityLabels';
import {runEvents} from '../runEvents';
import {skillSelectionEvents} from './selectionEvents';
import {builtinSkillCatalog} from './builtinCatalog';
import {selectNextRunSkills,readNextRunSkills} from './nextRun';
import { useUnsavedChanges } from '../../creative/useUnsavedChanges';
import { usePrimaryNavigationGuard } from '../../navigation/PrimaryNavigation';
import { CompactWorkbench, IconAction } from '../../creative/WorkbenchUI';
import { COLORS } from '../../ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable, Switch, Text, TextInput, View } from 'react-native';
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
  const scroll=useRef<ScrollView>(null);
  const [filter,setFilter]=useState<'all'|'local'|'builtin'|'selected'>('all');
  const lock = useRef(false);
  const confirmLeave=useUnsavedChanges(once!==null || addStatus.dirty,busy || addStatus.busy);
  usePrimaryNavigationGuard('agent',confirmLeave,Boolean(onClose));
  const latestLeave=useRef(confirmLeave);latestLeave.current=confirmLeave;
  useEffect(()=>{registerLeave?.(proceed=>latestLeave.current(proceed));return()=>registerLeave?.(undefined);},[registerLeave]);
  const back=()=>confirmLeave(()=>onClose?onClose():router.canGoBack()?router.back():router.replace('/(tabs)/agent'));
  useFallbackBack(()=>historyOpen&&intent!=='history'?setHistoryOpen(false):back());
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
    const history=<View style={{flex:1}}><View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:COLORS.border}}><IconAction label="返回来源" icon="arrow_back" onPress={closeHistory}/><Text accessibilityRole="header" style={s.title}>会话运行历史</Text></View><ScrollView contentContainerStyle={{padding:12,gap:12}}>{notice?<Text accessibilityRole="alert">{notice}</Text>:null}<Text style={s.muted}>只读查看已保存的运行；进入详情可核对执行阶段、固定版本及实际读取记录。</Text><View style={s.card}><Text style={s.title}>运行历史 · {historyScope==='all'?'全部':threadId?'本会话':projectId?'本项目':'全部'}</Text><ListAction label={historyScope==='all'?'返回当前范围':'查看全部范围'} secondary onPress={()=>{setHistoryScope(value=>value==='all'?'current':'all');setHistoryAfter(undefined);}}/>{!runs.length?<Text style={s.muted}>还没有运行记录</Text>:runs.slice(0,20).map(item=><View key={`${item.threadId}:${item.runId}`} ><ListAction label={'查看运行：'+(item.threadTitle??'未命名会话')+' · '+new Date(item.createdAt).toLocaleString()} secondary onPress={()=>confirmLeave(()=>router.push({pathname:'/agent-run',params:{threadId:item.threadId,runId:item.runId}}))}/><Text style={s.body}>{item.projectTitle??item.projectId??'无项目'} · {item.threadTitle??item.threadId} · {new Date(item.createdAt).toLocaleString()} · {RUN_LABELS[item.status as keyof typeof RUN_LABELS]??'状态未记录'}</Text><Text style={s.muted}>固定技能：{item.snapshot.versions.length?item.snapshot.versions.map(ref=>item.skillNames?.[ref.id]??'版本不可用').join('、'):'仅内置技能'} · 已完成文件读取 {item.reads?.length??0} 条</Text></View>)}{runs.length>20?<ListAction label="更早的运行" onPress={()=>{const last=runs[19];setHistoryAfter({createdAt:last.createdAt,threadId:last.threadId,runId:last.runId});}}/>:null}{historyAfter?<ListAction label="最新运行" onPress={()=>setHistoryAfter(undefined)}/>:null}</View></ScrollView></View>;
    return <CompactWorkbench>{onClose?history:<SafeAreaView style={s.screen}>{history}</SafeAreaView>}</CompactWorkbench>;
  }
  const orderedVersions=highlighted?[...versions.filter(v=>v.id===highlighted),...versions.filter(v=>v.id!==highlighted)]:versions;
  const body = <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:6,borderBottomWidth:1,borderColor:COLORS.border}}>
      <IconAction label={onClose ? '关闭技能' : '返回'} icon={onClose ? 'close' : 'arrow_back'} onPress={back}/>
      <Text accessibilityRole="header" style={{flex:1,fontSize:16,fontWeight:'600',color:COLORS.text}}>{projectId?'项目默认技能':'全局技能管理'}</Text>
      <IconAction label="添加技能" icon="add" onPress={()=>{if(onClose){confirmLeave(()=>{onClose();router.push({pathname:'/agent-skills',params:{intent:'add',projectId,threadId}});});}else {setHistoryOpen(false);setImportOpen(true);scroll.current?.scrollTo({y:0,animated:false});}}}/>
      <IconAction label="技能运行记录" icon="history" selected={historyOpen} onPress={()=>{void refresh(true).catch(error=>setNotice('运行记录刷新失败：'+error.message));setHistoryOpen(true);}}/>
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:10}}>
      {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}

      {!historyOpen?<>
      {threadId?<View style={s.card}><Text style={s.body}>只为此会话下一条消息选择技能，不改变全局或项目组合。</Text><Text style={s.muted}>{savedOnce?`${savedOnce.valid?'已固定，等待下一条消息消费':'已固定但已失效，请重新选择'}：${savedOnce.ids.length?savedOnce.ids.map(id=>versions.find(v=>v.id===id)?.name??id).join('、'):'仅内置技能'}`:'当前使用项目组合，没有单次覆盖'}</Text><ListAction label="选择下次运行技能" secondary disabled={busy} onPress={()=>setOnce(savedOnce?.ids??[])}/>{once?<><Text style={s.muted}>正在编辑，尚未保存 · 已选 {once.length}/8（空选表示仅内置技能）</Text><ListAction label="保存单次选择" disabled={busy} onPress={()=>void run(async()=>{await selectNextRunSkills(getDatabase(),threadId,once);setOnce(null);setNotice('已固定下一条消息的技能，发送时核对项目范围。');})}/></>:null}<ListAction label="取消单次覆盖，使用项目组合" secondary disabled={busy} onPress={()=>void run(async()=>{await selectNextRunSkills(getDatabase(),threadId,null);setOnce(null);setNotice('已恢复项目组合');})}/></View>:null}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['all','local','builtin','selected'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:filter===value}} accessibilityLabel={{all:'全部技能',local:'本地导入',builtin:'内置技能',selected:'当前启用'}[value]} onPress={()=>setFilter(value)} style={{minHeight:44,padding:10}}><Text style={s.body}>{{all:'全部技能',local:'本地导入',builtin:'内置技能',selected:'当前启用'}[value]}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="搜索技能" placeholder="搜索名称或用途" value={query} onChangeText={setQuery} style={s.input}/>
      <Text style={s.muted}>{versions.filter(v=>v.enabled).length} 个本地默认 · {builtins.length} 项内置可发现</Text>
      <Text style={{fontSize:12,color:COLORS.textMuted}}>{projectId?'作用范围：此项目的后续运行。未覆盖的技能继承全局默认；不会停止已有运行。':'作用范围：全局默认。停用会撤销此版本，并请求停止使用它的相关运行；项目默认与单次选择也可能失效。'}</Text>
      {projectId?<ListAction label="打开全局技能管理" secondary onPress={()=>confirmLeave(()=>router.push('/agent-skills'))}/>:null}

      {!versions.length ? <Text style={s.muted}>还没有本地技能，点击右上角 + 导入。内置技能随应用提供。</Text> : null}
      {orderedVersions.filter(v=>filter!=='builtin'&&(filter!=='selected'||v.enabled)).filter(v=>`${v.name} ${v.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(version=><View key={version.id} style={[s.card,{padding:10,gap:8}]}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${version.name} ${version.id.slice(0,8)}`} accessibilityState={{expanded:expanded===version.id}} onPress={()=>setExpanded(expanded===version.id?undefined:version.id)} style={{flex:1,minHeight:44,justifyContent:'center',gap:3}}>
            {version.id===highlighted?<Text style={s.muted}>{initialVersionId===version.id?'当前发布版本':'刚安装的版本'}</Text>:null}<Text style={s.title}>{version.name}</Text><Text numberOfLines={expanded===version.id?undefined:2} style={{fontSize:13,lineHeight:18,color:COLORS.textMuted}}>{version.description}</Text>
            <Text style={{fontSize:11,color:COLORS.textMuted}}>{version.id.slice(0,8)} · {projectId?(version.projectOverride?'此项目单独设置':'继承全局默认'):'全局默认'} · {expanded===version.id?'收起正文':'查看正文'}</Text>
          </Pressable>
          {projectId&&version.projectOverride?<ListAction label="恢复全局选择" secondary disabled={busy} onPress={()=>void run(()=>store.setProjectVersion(projectId,version.name,undefined))}/>:null}
          <Switch accessibilityLabel={`${projectId?'项目默认':'全局启用'} ${version.name} ${version.id.slice(0,8)}`} disabled={busy} value={version.enabled} onValueChange={enabled=>{
            const apply=()=>void run(async()=>{if(projectId){await store.setProjectVersion(projectId,version.name,enabled?version.id:null);setNotice('已更新项目技能，仅影响新运行；已有运行保持版本快照。');}else{if(enabled) await store.enable(version.id);else await store.revoke(version.id);setNotice(enabled?'已启用，将用于新运行。':'已停用，相关运行已请求停止。');}});
            if(!projectId&&!enabled)Alert.alert('全局停用此技能版本？',`将撤销 ${version.name}，并请求停止使用此版本的相关运行。项目默认与已固定的单次选择也可能受影响。`,[{text:'取消',style:'cancel'},{text:'全局停用',style:'destructive',onPress:apply}]);else apply();
          }}/>
        </View>
        {once?<ListAction label={(once.includes(version.id)?'✓ ':'')+'本次选用 '+version.name} secondary disabled={busy} onPress={()=>setOnce(ids=>ids?.includes(version.id)?ids.filter(id=>id!==version.id):(ids?.length??0)<8?[...(ids??[]),version.id]:ids)}/>:null}
        {version.capabilities?<Text style={s.muted}>需要工具：{version.capabilities.tools.join('、')||'无'} · 输入：{version.capabilities.inputs.join('、')} · 输出：{version.capabilities.output}（声明不会授予权限）</Text>:null}
        {expanded===version.id ? <><Text style={s.muted}>{Object.keys(version.files).join(' · ')}</Text><Text selectable style={s.body}>{version.files['SKILL.md']}</Text></> : null}
      </View>)}

      {(filter==='all'||filter==='builtin')?<><Text style={s.muted}>内置技能随 APK 提供，只读且始终可发现。可用不表示实际使用；指令不授予工具或外发权限。</Text>{builtins.filter(v=>`${v.name} ${v.displayName} ${v.summary} ${v.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(v=><View key={v.path} style={s.card}><Pressable accessibilityRole="button" accessibilityLabel={'内置：'+v.displayName} accessibilityState={{expanded:expanded===v.path}} onPress={()=>setExpanded(expanded===v.path?undefined:v.path)} style={{minHeight:44,gap:6}}><Text style={s.title}>{v.displayName}</Text><Text numberOfLines={2} style={s.body}>{v.summary}</Text><Text style={s.muted}>内置 · {v.version} · 所有项目可发现 · {expanded===v.path?'收起详情':'查看详情'}</Text></Pressable>{expanded===v.path?<><Text style={s.body}>{v.description}</Text><Text selectable style={s.muted}>包指纹 {v.fingerprint}</Text>{Object.entries(v.files).map(([path,body])=><View key={path}><Text style={s.title}>{path}</Text><Text selectable style={s.body}>{body}</Text></View>)}</>:null}</View>)}</>:null}
      </>:null}
    </ScrollView>
  </KeyboardAvoidingView>;
  return <CompactWorkbench>{onClose ? body : <SafeAreaView style={s.screen}>{body}</SafeAreaView>}</CompactWorkbench>;
}
