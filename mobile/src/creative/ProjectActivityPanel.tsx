import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {creativeService} from './runtime';
import {readProjectActivity,type ProjectActivity as Entry} from './projectActivity';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
export function ProjectActivity({projectId}:{projectId:string}){
  const router=useRouter(),[rows,setRows]=useState<Entry[]>([]),[error,setError]=useState('');
  useEffect(()=>{let live=true;const refresh=async()=>{try{const rows=await readProjectActivity(getDatabase(),projectId);if(live)setRows(rows);}catch{if(live)setError('活动读取失败');}};void refresh();const timer=setInterval(()=>void refresh(),3000);return()=>{live=false;clearInterval(timer);};},[projectId]);
  return <View style={{gap:12}}><Text style={{color:COLORS.text,fontSize:20,fontWeight:'700'}}>项目活动</Text>
    {error?<Text style={{color:COLORS.danger}}>{error}</Text>:null}
    {!rows.length?<Text style={{color:COLORS.textMuted}}>尚无活动。</Text>:null}
    {rows.map(r=><View key={`${r.kind}:${r.id}`} style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:10,gap:6}}>
      <Text style={{color:COLORS.text}}>{r.label} · {r.state}</Text><Text style={{color:COLORS.textMuted}}>{new Date(r.createdAt).toLocaleString()} · {r.origin==='agent'?'Agent':r.origin==='user'?'手动操作':r.origin==='executor'?'执行器':'计划'}</Text>
      {r.jobId?<ListAction label="查看任务" secondary onPress={()=>router.push('/(tabs)/tasks')}/>:r.draftId?<ListAction label="查看草稿" secondary onPress={()=>void creativeService().draft(r.draftId!).then(d=>{if(d)router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}});}).catch(()=>setError('草稿读取失败'))}/>:null}
    </View>)}
  </View>;
}
