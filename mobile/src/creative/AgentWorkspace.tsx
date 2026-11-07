import {useCallback,useState,useRef} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {LocalHistoryBrowser} from '../agent/LocalHistoryBrowser';
import {getDatabase} from '../storage/databaseClient';
import {checkDatabaseAccessAsync} from '../storage/databaseAccess';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import AgentScreen from '../agent/AgentScreen';
import {creativeService} from './runtime';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import type {CreativeProject} from './types';

/** Open chat directly. Project selection belongs to the chat header. */
export function AgentWorkspace(){
 const {projectId,shotId,shotTitle}=useLocalSearchParams<{projectId?:string;shotId?:string;shotTitle?:string}>();
 const router=useRouter(),fallback=useRef<string|undefined>(undefined);
 const [projects,setProjects]=useState<CreativeProject[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [historyOpen,setHistoryOpen]=useState(false),[historyAllowed,setHistoryAllowed]=useState(false),[copied,setCopied]=useState(false);
 useFocusEffect(useCallback(()=>{let live=true;void creativeService().projects().then(rows=>{if(live){if(!rows.some(p=>p.id===fallback.current))fallback.current=rows[0]?.id;setProjects(rows);setError('');}}).catch(async reason=>{
   // Retain the mounted conversation and its draft on a background refresh failure.
   const code=reason instanceof Error&&reason.message.startsWith('APP_DATABASE_READ_ONLY:')?'DATABASE_PROTECTED':reason instanceof TypeError?'PROJECT_READ_TYPE_ERROR':'PROJECT_READ_FAILED';
   let allowed=false;try{allowed=await checkDatabaseAccessAsync(getDatabase());}catch{/* recovery is owned by the application shell */}
   if(live){setError(code);setHistoryAllowed(allowed);setCopied(false);}
 });return()=>{live=false;};},[retry]));
 const issue=error?<View style={[s.content,{gap:12}]}><Text accessibilityRole="header" style={s.title}>创作助手</Text><Text accessibilityRole="alert" style={s.error}>{error==='DATABASE_PROTECTED'?'项目数据暂时不可用':'暂时无法读取项目'}</Text>{!projects?<><Text style={s.muted}>{error==='DATABASE_PROTECTED'?'请返回数据维护检查恢复状态。':'重试读取不会创建新会话；已有草稿会保留。'}</Text>{historyAllowed&&projectId?<ListAction label="查看此项目本地对话" secondary onPress={()=>setHistoryOpen(true)}/>:null}<ListAction label="前往数据维护" secondary onPress={()=>router.navigate({pathname:'/settings-panel',params:{section:'storage'}})}/><ListAction label={copied?'已复制诊断编号':'复制诊断编号'} secondary onPress={()=>{void Clipboard.setStringAsync(`AGENT_PROJECT_READ:${error}`).then(()=>setCopied(true));}}/></>:null}<ListAction label="重试读取项目" onPress={()=>setRetry(n=>n+1)}/></View>:null;
 if(!projects&&issue)return <View style={s.screen}>{issue}{historyOpen?<LocalHistoryBrowser projectId={projectId??fallback.current} onClose={()=>setHistoryOpen(false)}/>:null}</View>;
 if(!projects)return <View style={[s.screen,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator/></View>;
 if(!projects.length&&!projectId)return <View style={[s.screen,{justifyContent:'center',alignItems:'center',padding:24,gap:16}]}><Text style={s.title}>先创建一个项目</Text><Text style={s.muted}>助手会将对话和素材保存在项目中。</Text><ListAction label="前往项目" icon="add" onPress={()=>router.navigate('/(tabs)/projects')}/></View>;
 // Preserve an explicit scope, including an archived project's conversation.
 const selected=projectId??fallback.current??projects[0]?.id;
 return <View style={s.screen}>{issue}<AgentScreen key={selected} projectId={selected} focus={shotId?{shotId,title:shotTitle??shotId}:undefined}/>{historyOpen?<LocalHistoryBrowser projectId={selected} onClose={()=>setHistoryOpen(false)}/>:null}</View>;
}
