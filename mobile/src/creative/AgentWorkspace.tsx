import {useCallback,useState,useRef} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
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
 useFocusEffect(useCallback(()=>{let live=true;void creativeService().projects().then(rows=>{if(live){if(!rows.some(p=>p.id===fallback.current))fallback.current=rows[0]?.id;setProjects(rows);setError('');}}).catch(()=>{if(live)setError('项目读取失败');});return()=>{live=false;};},[retry]));
 if(error)return <View style={s.content}><Text accessibilityRole="alert" style={s.error}>{error}</Text><ListAction label="重试" onPress={()=>setRetry(n=>n+1)}/></View>;
 if(!projects)return <View style={[s.screen,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator/></View>;
 if(!projects.length&&!projectId)return <View style={[s.screen,{justifyContent:'center',alignItems:'center',padding:24,gap:16}]}><Text style={s.title}>先创建一个项目</Text><Text style={s.muted}>助手会将对话和素材保存在项目中。</Text><ListAction label="前往项目" icon="add" onPress={()=>router.navigate('/(tabs)/projects')}/></View>;
 // Preserve an explicit scope, including an archived project's conversation.
 const selected=projectId??fallback.current??projects[0]?.id;
 return <AgentScreen key={selected} projectId={selected} focus={shotId?{shotId,title:shotTitle??shotId}:undefined}/>;
}
