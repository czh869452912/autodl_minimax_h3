import {localTime} from '../../ui/localTime';
import {IconAction} from '../../creative/WorkbenchUI';
import {COLORS} from '../../ui/theme';
import {ReadOnlyMessage} from '../ReadOnlyMessage';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {runEvents} from '../runEvents';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useSourceBack} from '../../navigation/useSourceBack';
import {getDatabase} from '../../storage/databaseClient';
import {createLocalThreadStore,type LocalThreadSnapshot} from '../threadStore';
import {readPromptRuns} from '../runState';
import {ListAction} from '../../ui/ListPageUI';
import {creativeUI as s} from '../../creative/creativeUI';
import {createSkillStore} from './store';
import {RUN_LABELS,toolActivity} from '../../conversation/activityLabels';
export function SkillRunScreen(){
 const {threadId,runId}=useLocalSearchParams<{threadId:string;runId:string}>(),back=useSourceBack();
 const [snapshot,setSnapshot]=useState<LocalThreadSnapshot|null>(null),[error,setError]=useState(''),[all,setAll]=useState(false);
 const store=useMemo(()=>createLocalThreadStore(getDatabase()),[]);
 const skills=useMemo(()=>createSkillStore(getDatabase()),[]);
 const [evidence,setEvidence]=useState<Awaited<ReturnType<typeof skills.runs>>[number]>(),[diagnostics,setDiagnostics]=useState(false),[expanded,setExpanded]=useState<string>();
 const generation=useRef(0);
 const [loading,setLoading]=useState(false);
 const refresh=useCallback(async()=>{
  const request=++generation.current;
  setLoading(true);
  try{
   const [value,records]=await Promise.all([store.load(threadId),skills.runs({threadId,runId,limit:1})]);
   if(request!==generation.current)return;
   setSnapshot(value);setEvidence(records[0]);setError(value?'':'会话已删除或不可用');
  }catch(reason){
   if(request===generation.current)setError('读取最新记录失败，已显示的内容可能不是最新：'+(reason instanceof Error?reason.message:String(reason)));
  }finally{if(request===generation.current)setLoading(false);}
 },[store,skills,threadId,runId]);
 useEffect(()=>{setSnapshot(null);setEvidence(undefined);setDiagnostics(false);setExpanded(undefined);setError('');setAll(false);return()=>{generation.current++;};},[threadId,runId]);
 useFocusEffect(useCallback(()=>{void refresh();return()=>{generation.current++;};},[refresh]));
 useEffect(()=>{
  const unsubscribe=runEvents.subscribe(event=>{if(event.threadId===threadId)void refresh();});
  return()=>{unsubscribe();generation.current++;};
 },[threadId,refresh]);
 const run=readPromptRuns(snapshot?.state).find(item=>item.id===runId);
 const ids=new Set(run?[run.userMessageId,...run.messageIds]:[]);
 const toolStates={running:'进行中',complete:'已完成',failed:'失败',cancelled:'已停止'};
 return <SafeAreaView style={s.screen}><View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderBottomWidth:1,borderColor:COLORS.border}}><IconAction label="返回来源" icon="arrow_back" onPress={back}/><Text accessibilityRole="header" style={[s.title,{flex:1}]}>运行记录</Text><IconAction label="获取最新记录" icon="refresh" disabled={loading} onPress={()=>void refresh()}/></View><ScrollView contentContainerStyle={{padding:16,gap:12}}>
  <Text style={s.body}>{snapshot?.customTitle??snapshot?.summary?.title??'原会话'} · 只读</Text>
  {loading?<Text accessibilityLiveRegion="polite">正在读取最新记录…</Text>:null}{error?<Text accessibilityRole="alert">{error}</Text>:null}
  {snapshot&&!run?<Text>运行记录不可用；保留的技能快照不代表实际执行。</Text>:null}
  {run?<View style={s.card}>
   <Text style={s.title}>{RUN_LABELS[run.status]}</Text><Text style={s.body}>开始：{localTime(run.startedAt)}{run.endedAt?'\n结束：'+localTime(run.endedAt):''}</Text>
   {run.error?<Text accessibilityRole="alert" selectable style={s.body}>{run.error}</Text>:null}
   <Text style={s.muted}>这是已保存的助手运行记录。查看或刷新不会重新运行；生成任务仍以任务中心状态为准。</Text>
  </View>:null}
  {run?.tools.length?<Text style={s.title}>执行阶段</Text>:null}
  {run&&!run.tools.length?<Text style={s.muted}>此运行没有已记录的工具阶段，请查看下方对话内容。</Text>:null}
  {run?.tools.map(tool=><View key={tool.id} style={s.card}>
   <Pressable accessibilityRole="button" accessibilityLabel={'阶段：'+toolActivity(tool.name)} accessibilityState={{expanded:expanded===tool.id}} onPress={()=>setExpanded(expanded===tool.id?undefined:tool.id)} style={{minHeight:48,justifyContent:'center',gap:6}}>
    <Text style={s.title}>{toolActivity(tool.name)} · {toolStates[tool.status]}</Text><Text style={s.muted}>{localTime(tool.startedAt,true)}{tool.endedAt?' → '+localTime(tool.endedAt,true):''} · {expanded===tool.id?'收起证据':'查看证据'}</Text>
   </Pressable>
   {expanded===tool.id?<><Text selectable style={s.body}>{tool.summary||'没有阶段摘要'}</Text>{tool.output?<Text selectable style={s.body}>{tool.output}</Text>:null}</>:null}
  </View>)}
  <Text style={s.title}>{all?'原会话全部消息':'本次运行消息'}</Text>
  <ListAction label={all?'仅看此运行消息':'查看原会话全部消息'} secondary onPress={()=>setAll(!all)}/>
  {snapshot?.messages.filter(message=>all||ids.has(message.id)).map(message=><ReadOnlyMessage key={message.id} message={message}/>)}
  <ListAction label={diagnostics?'收起技能与诊断':'技能与诊断'} secondary onPress={()=>setDiagnostics(!diagnostics)}/>
  {diagnostics?<View style={s.card}>
   <Text selectable style={s.muted}>会话：{threadId}{'\n'}运行：{runId}{run?.retryOf?'\n重试来源：'+run.retryOf:''}</Text>
   <Text style={s.title}>固定技能版本</Text>
   <Text selectable style={s.body}>{evidence?(evidence.snapshot.versions.length?evidence.snapshot.versions.map(ref=>`${evidence.skillNames[ref.id]??'版本不可用'} · ${ref.id}`).join('\n'):'仅内置技能'):'未保存技能快照，不能用当前配置解释历史运行'}</Text>
   <Text selectable style={s.muted}>内置包：{evidence?.snapshot.builtin?.fingerprint??'旧运行未记录，不能用当前包解释'}</Text>
   <Text style={s.title}>已完成技能文件读取</Text><Text selectable style={s.body}>{evidence?.reads?.join('\n')||'无记录；可用或已固定不表示实际读取，也不能据此推断未使用。'}</Text>
   {evidence?.usage?<Text style={s.muted}>模型调用 {evidence.usage.model_calls} 次 · 工具调用 {evidence.usage.tool_calls} 次 · 估算预留 {evidence.usage.estimated_tokens} tokens · 已报告 {evidence.usage.reported_tokens} tokens</Text>:null}
   <Text style={s.title}>原始工具记录</Text><Text selectable style={s.body}>{JSON.stringify(run?.tools??[],null,2)}</Text>
  </View>:null}
 </ScrollView></SafeAreaView>;
}
