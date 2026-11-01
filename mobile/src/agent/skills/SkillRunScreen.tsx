import {ReadOnlyMessage} from '../ReadOnlyMessage';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {runEvents} from '../runEvents';
import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {useSourceBack} from '../../navigation/useSourceBack';
import {getDatabase} from '../../storage/databaseClient';
import {createLocalThreadStore,type LocalThreadSnapshot} from '../threadStore';
import {readPromptRuns} from '../runState';
import {ListAction} from '../../ui/ListPageUI';
import {creativeUI as s} from '../../creative/creativeUI';
export function SkillRunScreen(){
 const {threadId,runId}=useLocalSearchParams<{threadId:string;runId:string}>(),back=useSourceBack();
 const [snapshot,setSnapshot]=useState<LocalThreadSnapshot|null>(null),[error,setError]=useState(''),[all,setAll]=useState(false);
 const store=useMemo(()=>createLocalThreadStore(getDatabase()),[]);
 const generation=useRef(0);
 const [loading,setLoading]=useState(false);
 const refresh=useCallback(async()=>{
  const request=++generation.current;
  setLoading(true);
  try{
   const value=await store.load(threadId);
   if(request!==generation.current)return;
   setSnapshot(value);setError(value?'':'会话已删除或不可用');
  }catch(reason){
   if(request===generation.current)setError('读取最新记录失败，已显示的内容可能不是最新：'+(reason instanceof Error?reason.message:String(reason)));
  }finally{if(request===generation.current)setLoading(false);}
 },[store,threadId,runId]);
 useEffect(()=>{setSnapshot(null);setError('');setAll(false);return()=>{generation.current++;};},[threadId,runId]);
 useFocusEffect(useCallback(()=>{void refresh();return()=>{generation.current++;};},[refresh]));
 useEffect(()=>{
  const unsubscribe=runEvents.subscribe(event=>{if(event.threadId===threadId)void refresh();});
  return()=>{unsubscribe();generation.current++;};
 },[threadId,refresh]);
 const run=readPromptRuns(snapshot?.state).find(item=>item.id===runId);
 const ids=new Set(run?[run.userMessageId,...run.messageIds]:[]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回来源" secondary onPress={back}/><Text style={s.title}>运行证据 · 只读</Text><ListAction label="获取最新记录" secondary disabled={loading} onPress={()=>void refresh()}/>{loading?<Text accessibilityLiveRegion="polite">正在读取最新记录…</Text>:null}<Text selectable style={s.body}>会话：{snapshot?.customTitle??threadId}{'\n'}运行：{runId}</Text>{error?<Text accessibilityRole="alert">{error}</Text>:null}{snapshot&&!run?<Text>运行记录不可用；保留的技能快照不代表实际执行。</Text>:null}{run?<><Text style={s.body}>{run.status} · {new Date(run.startedAt).toLocaleString()}</Text><Text selectable style={s.body}>{run.error??''}</Text><Text selectable style={s.body}>{JSON.stringify(run.tools,null,2)}</Text></>:null}<ListAction label={all?'仅看此运行消息':'查看原会话全部消息'} secondary onPress={()=>setAll(!all)}/>{snapshot?.messages.filter(message=>all||ids.has(message.id)).map(message=><ReadOnlyMessage key={message.id} message={message}/>)}</ScrollView></SafeAreaView>;
}
