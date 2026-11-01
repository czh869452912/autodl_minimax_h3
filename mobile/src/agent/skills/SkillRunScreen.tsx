import {useEffect,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams} from 'expo-router';
import {useSourceBack} from '../../navigation/useSourceBack';
import {getDatabase} from '../../storage/databaseClient';
import {createLocalThreadStore,type LocalThreadSnapshot} from '../threadStore';
import {readPromptRuns} from '../runState';
import {ListAction} from '../../ui/ListPageUI';
import {creativeUI as s} from '../../creative/creativeUI';
export function SkillRunScreen(){
 const {threadId,runId}=useLocalSearchParams<{threadId:string;runId:string}>(),back=useSourceBack();
 const [snapshot,setSnapshot]=useState<LocalThreadSnapshot|null>(null),[error,setError]=useState(''),[all,setAll]=useState(false);
 useEffect(()=>{let live=true;setSnapshot(null);setError('');setAll(false);void createLocalThreadStore(getDatabase()).load(threadId).then(value=>{if(live){setSnapshot(value);if(!value)setError('会话已删除或不可用');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[threadId,runId]);
 const run=readPromptRuns(snapshot?.state).find(item=>item.id===runId);
 const ids=new Set(run?[run.userMessageId,...run.messageIds]:[]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回来源" secondary onPress={back}/><Text style={s.title}>运行证据 · 只读</Text><Text selectable style={s.body}>会话：{snapshot?.customTitle??threadId}{'\n'}运行：{runId}</Text>{error?<Text accessibilityRole="alert">{error}</Text>:null}{snapshot&&!run?<Text>运行记录不可用；保留的技能快照不代表实际执行。</Text>:null}{run?<><Text style={s.body}>{run.status} · {new Date(run.startedAt).toLocaleString()}</Text><Text selectable style={s.body}>{run.error??''}</Text><Text selectable style={s.body}>{JSON.stringify(run.tools,null,2)}</Text></>:null}<ListAction label={all?'仅看此运行消息':'查看原会话全部消息'} secondary onPress={()=>setAll(!all)}/>{snapshot?.messages.filter(message=>all||ids.has(message.id)).map(message=><Text key={message.id} selectable style={s.body}>{message.role} · {message.id}{'\n'}{typeof message.content==='string'?message.content:JSON.stringify(message.content)}</Text>)}</ScrollView></SafeAreaView>;
}
