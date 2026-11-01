import {skillSelectionEvents} from './selectionEvents';
import {builtinSkillCatalog} from './builtinCatalog';
import {selectNextRunSkills,readNextRunSkills} from './nextRun';
import { useUnsavedChanges } from '../../creative/useUnsavedChanges';
import { usePrimaryNavigationGuard } from '../../navigation/PrimaryNavigation';
import { CompactWorkbench, IconAction } from '../../creative/WorkbenchUI';
import { COLORS } from '../../ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { getDatabase } from '../../storage/databaseClient';
import { createSkillStore, type SkillVersion } from './store';
import { readSkillZip, SKILL_BYTES, validateSkillPackage, type SkillPackage } from './package';
import { ListAction } from '../../ui/ListPageUI';
import { creativeUI as s } from '../../creative/creativeUI';
import { useFallbackBack } from '../../navigation/useFallbackBack';

const template = '---\nname: scene-review\ndescription: 检查场景描述中的主体、动作和镜头是否清楚\n---\n\n阅读用户的场景描述。指出主体、动作与镜头中的歧义，再给出可供审阅的改写。保留用户明确给出的约束。';

export function SkillLibraryScreen({ onClose, registerLeave, intent, projectId: requestedProjectId, threadId }: { threadId?:string; projectId?:string; intent?:string; onClose?: () => void; registerLeave?:(guard:((proceed:()=>void)=>void)|undefined)=>void } = {}) {
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
  const [advanced,setAdvanced]=useState(false);
  const [purpose,setPurpose]=useState(''),[scope,setScope]=useState('');
  const [text, setText] = useState(''), [preview, setPreview] = useState<SkillPackage>();
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [importOpen,setImportOpen]=useState(intent==='add'),[historyOpen,setHistoryOpen]=useState(false),[expanded,setExpanded]=useState<string>(),[query,setQuery]=useState('');
  const scroll=useRef<ScrollView>(null);
  const [filter,setFilter]=useState<'all'|'local'|'builtin'|'selected'>('all');
  const lock = useRef(false);
  const confirmLeave=useUnsavedChanges(Boolean(once!==null || text.trim() || purpose.trim() || scope.trim() || preview),busy);
  usePrimaryNavigationGuard('agent',confirmLeave,Boolean(onClose));
  const latestLeave=useRef(confirmLeave);latestLeave.current=confirmLeave;
  useEffect(()=>{registerLeave?.(proceed=>latestLeave.current(proceed));return()=>registerLeave?.(undefined);},[registerLeave]);
  const back=()=>confirmLeave(()=>onClose?onClose():router.canGoBack()?router.back():router.replace('/(tabs)/agent'));
  useFallbackBack(back);
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
  useFocusEffect(useCallback(() => { void refresh().catch(error => setNotice(String(error.message))); }, [refresh]));
  useEffect(() => {
    const unsubscribe = skillSelectionEvents.subscribe(changed => {
      // Refresh committed state, leaving the user's unsaved `once` draft intact.
      if (changed === threadId) void refresh(true).catch(error => setNotice('技能状态刷新失败，请重新打开面板：' + error.message));
    });
    return () => { unsubscribe(); readGeneration.current++; };
  }, [threadId, refresh]);
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await work(); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0], file = new File(asset.uri);
    if (file.size > SKILL_BYTES) throw new Error('技能文件最大 512 KiB');
    if (/\.zip$/i.test(asset.name)) setPreview(readSkillZip(await file.bytes()));
    else if (/\.md$/i.test(asset.name)) setPreview(validateSkillPackage({ 'SKILL.md': await file.text() }));
    else throw new Error('请选择 SKILL.md 或单技能 ZIP 文件');
  };
  if(!scopeReady)return <View><Text>{notice||'正在核对会话技能范围…'}</Text><ListAction label="返回" onPress={back}/></View>;
  const body = <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:6,borderBottomWidth:1,borderColor:COLORS.border}}>
      <IconAction label={onClose ? '关闭技能' : '返回'} icon={onClose ? 'close' : 'arrow_back'} onPress={back}/>
      <Text accessibilityRole="header" style={{flex:1,fontSize:16,fontWeight:'600',color:COLORS.text}}>{projectId?'项目技能':'技能'} · {versions.filter(v=>v.enabled).length} 本地启用 · {builtins.length} 内置可用</Text>
      <IconAction label="添加技能" icon="add" onPress={()=>{if(onClose){confirmLeave(()=>{onClose();router.push({pathname:'/agent-skills',params:{intent:'add',projectId,threadId}});});}else {setHistoryOpen(false);setImportOpen(true);scroll.current?.scrollTo({y:0,animated:false});}}}/>
      <IconAction label="技能运行记录" icon="history" selected={historyOpen} onPress={()=>{setHistoryOpen(!historyOpen);scroll.current?.scrollTo({y:0,animated:false});}}/>
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:10}}>
      {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}
      {historyOpen ? <View style={s.card}><Text style={s.title}>最近运行的技能快照 · {historyScope==='all'?'全部':threadId?'本会话':projectId?'本项目':'全部'}</Text><ListAction label={historyScope==='all'?'返回当前范围':'查看全部范围'} secondary onPress={()=>{setHistoryScope(value=>value==='all'?'current':'all');setHistoryAfter(undefined);}}/>{!runs.length?<Text style={s.muted}>还没有运行记录</Text>:runs.slice(0,20).map(item=><View key={`${item.threadId}:${item.runId}`} ><ListAction label={'查看运行 '+item.runId.slice(0,12)} secondary onPress={()=>confirmLeave(()=>router.push({pathname:'/agent-run',params:{threadId:item.threadId,runId:item.runId}}))}/><Text style={s.body}>{item.projectTitle??item.projectId??'无项目'} · {item.threadTitle??item.threadId} · {new Date(item.createdAt).toLocaleString()} · {item.status??'状态未记录'}</Text><Text selectable style={s.muted}>{item.runId.slice(0,12)} · {item.snapshot.versions.length?item.snapshot.versions.map(ref=>`${item.skillNames?.[ref.id]??'版本不可用'}@${ref.id.slice(0,8)}`).join('、'):'仅内置技能'}{' · 内置包：'+(item.snapshot.builtin?.fingerprint??'旧运行未记录，不能用当前包解释')+' · 已完成文件读取：'+(item.reads?.join('、')||'无记录（不能据此推断未使用）')}{item.usage?` · 模型 ${item.usage.model_calls}/32 · 工具 ${item.usage.tool_calls}/100 · 估算预留 ${item.usage.estimated_tokens} tokens · 已报告 ${item.usage.reported_tokens} tokens`:''}</Text></View>)}{runs.length>20?<ListAction label="更早的运行" onPress={()=>{const last=runs[19];setHistoryAfter({createdAt:last.createdAt,threadId:last.threadId,runId:last.runId});}}/>:null}{historyAfter?<ListAction label="最新运行" onPress={()=>setHistoryAfter(undefined)}/>:null}</View>:null}
      {!historyOpen?<>
      {importOpen && !onClose ? <View style={[s.card,{gap:8}]}><ListAction label="收起添加表单（保留输入）" secondary onPress={()=>setImportOpen(false)}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
          <ListAction label="导入 SKILL.md 或 ZIP" disabled={busy} onPress={()=>void run(pick)}/>
          <ListAction label="从对话提炼技能" secondary disabled={busy} onPress={()=>router.push({pathname:'/agent-skill-extract',params:{projectId,threadId}})}/>
        </View>
        <Text style={s.body}>先说明技能帮助完成什么，以及适用的场景。安装后仍需单独启用。</Text>
        <Text style={s.body}>用途与适用范围</Text>
        <TextInput accessibilityLabel="技能用途" placeholder="这项技能帮助完成什么" value={purpose} onChangeText={setPurpose} editable={!busy} style={s.input}/>
        <TextInput accessibilityLabel="技能适用范围" placeholder="什么场景使用，有哪些约束" value={scope} onChangeText={setScope} editable={!busy} multiline style={s.input}/>
        <ListAction label="生成可编辑的技能草稿" secondary disabled={busy || !purpose.trim()} onPress={()=>{setText('---\nname: my-creative-skill\ndescription: '+JSON.stringify(purpose.trim())+'\n---\n\n'+purpose.trim()+'\n\n适用范围与约束：'+scope.trim());setAdvanced(true);}}/>
        <ListAction label={advanced?'收起高级格式':'高级：编辑 SKILL.md 格式'} secondary onPress={()=>setAdvanced(!advanced)}/>
        {advanced?<TextInput accessibilityLabel="技能文本" placeholder="也可粘贴 SKILL.md 正文" value={text} onChangeText={setText} editable={!busy} multiline maxLength={SKILL_BYTES} style={[s.input,{minHeight:100,textAlignVertical:'top'}]}/>:null}
        <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>
          <ListAction label="检查粘贴的技能" disabled={busy || !text.trim()} onPress={()=>void run(async()=>{setPreview(validateSkillPackage({'SKILL.md':text}));})}/>
          <ListAction label="填入技能示例" secondary disabled={busy} onPress={()=>{setText(template);setAdvanced(true);}}/>
        </View>
      </View> : null}
      {preview ? <View style={s.card}>
        <Text style={s.title}>{preview.name} · 待安装</Text><Text style={s.body}>{preview.description}</Text>
        <Text selectable style={s.muted}>{preview.files['SKILL.md'].slice(0,4000)}</Text>
        <View style={{flexDirection:'row',gap:6}}>
          <ListAction label="安装此版本" disabled={busy} onPress={()=>void run(async()=>{await store.install(preview);setPreview(undefined);setImportOpen(false);setText('');setPurpose('');setScope('');setNotice('已安装，打开开关后在新对话运行中生效。');})}/>
          <ListAction label="关闭预览" secondary disabled={busy} onPress={()=>setPreview(undefined)}/>
        </View>
      </View> : null}
      {threadId?<View style={s.card}><Text style={s.body}>只为此会话下一条消息选择技能，不改变全局或项目组合。</Text><Text style={s.muted}>{savedOnce?`${savedOnce.valid?'已固定，等待下一条消息消费':'已固定但已失效，请重新选择'}：${savedOnce.ids.length?savedOnce.ids.map(id=>versions.find(v=>v.id===id)?.name??id).join('、'):'仅内置技能'}`:'当前使用项目组合，没有单次覆盖'}</Text><ListAction label="选择下次运行技能" secondary disabled={busy} onPress={()=>setOnce(savedOnce?.ids??[])}/>{once?<><Text style={s.muted}>正在编辑，尚未保存 · 已选 {once.length}/8（空选表示仅内置技能）</Text><ListAction label="保存单次选择" disabled={busy} onPress={()=>void run(async()=>{await selectNextRunSkills(getDatabase(),threadId,once);setOnce(null);setNotice('已固定下一条消息的技能，发送时核对项目范围。');})}/></>:null}<ListAction label="取消单次覆盖，使用项目组合" secondary disabled={busy} onPress={()=>void run(async()=>{await selectNextRunSkills(getDatabase(),threadId,null);setOnce(null);setNotice('已恢复项目组合');})}/></View>:null}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['all','local','builtin','selected'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:filter===value}} accessibilityLabel={{all:'全部技能',local:'本地导入',builtin:'内置技能',selected:'当前启用'}[value]} onPress={()=>setFilter(value)} style={{minHeight:44,padding:10}}><Text style={s.body}>{{all:'全部技能',local:'本地导入',builtin:'内置技能',selected:'当前启用'}[value]}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="搜索技能" placeholder="搜索名称或用途" value={query} onChangeText={setQuery} style={s.input}/>
      <Text style={{fontSize:12,color:COLORS.textMuted}}>{projectId?'项目选择只影响新运行。同名技能固定一个版本；关闭表示此项目不使用该技能。紧急撤销请到全局技能管理。':'启用后用于新运行。同名技能只启用一个版本；停用会停止使用该版本的运行。'}</Text>

      {!versions.length ? <Text style={s.muted}>还没有本地技能，点击右上角 + 导入。内置技能随应用提供。</Text> : null}
      {versions.filter(v=>filter!=='builtin'&&(filter!=='selected'||v.enabled)).filter(v=>`${v.name} ${v.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(version=><View key={version.id} style={[s.card,{padding:10,gap:8}]}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${version.name} ${version.id.slice(0,8)}`} accessibilityState={{expanded:expanded===version.id}} onPress={()=>setExpanded(expanded===version.id?undefined:version.id)} style={{flex:1,minHeight:44,justifyContent:'center',gap:3}}>
            <Text style={s.title}>{version.name}</Text><Text numberOfLines={expanded===version.id?undefined:2} style={{fontSize:13,lineHeight:18,color:COLORS.textMuted}}>{version.description}</Text>
            <Text style={{fontSize:11,color:COLORS.textMuted}}>{version.id.slice(0,8)} · {expanded===version.id?'收起正文':'查看正文'}</Text>
          </Pressable>
          {projectId&&version.projectOverride?<ListAction label="恢复全局选择" secondary disabled={busy} onPress={()=>void run(()=>store.setProjectVersion(projectId,version.name,undefined))}/>:null}
          <Switch accessibilityLabel={`启用 ${version.name} ${version.id.slice(0,8)}`} disabled={busy} value={version.enabled} onValueChange={enabled=>void run(async()=>{if(projectId){await store.setProjectVersion(projectId,version.name,enabled?version.id:null);setNotice('已更新项目技能，仅影响新运行；已有运行保持版本快照。');}else{if(enabled) await store.enable(version.id);else await store.revoke(version.id);setNotice(enabled?'已启用，将用于新运行。':'已停用，相关运行已请求停止。');}})}/>
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
