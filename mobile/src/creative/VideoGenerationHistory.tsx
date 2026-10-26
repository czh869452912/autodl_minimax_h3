import {useEffect,useRef,useState} from 'react';
import {FlatList,Pressable,Text,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import {creativeService} from './runtime';
import {getDatabase} from '../storage/databaseClient';
import {videoSessionDrafts} from './workbenchSessions';
import {videoSession} from './videoDraftState';
import type {CreativeDraft} from './drafts';
import type {AssetVersion} from './types';
import {CreativeResults,creativeJobLabel} from './CreativeResults';
import {MediaPreview} from './MediaPreview';
import {TextAction} from './WorkbenchUI';
import {COLORS} from '../ui/theme';
import {useRouter} from 'expo-router';

type Job={id:string;status:string;created_at:number;started_at:number|null;execution_duration:number|null;updated_at:number};
export type VideoRound={draft:CreativeDraft;job:Job;versions:AssetVersion[]};
export function videoRoundTimes(job:Job,now=Date.now()){
  const pending=['SUBMITTING','QUEUED','RUNNING','READY_TO_SUBMIT'].includes(job.status);
  const format=(seconds:number|null)=>seconds===null?'未记录':seconds<60?`${Math.floor(seconds)}秒`:`${Math.floor(seconds/60)}分${Math.floor(seconds%60)}秒`;
  const queue=job.started_at!==null?Math.max(0,(job.started_at-job.created_at)/1000):pending?Math.max(0,(now-job.created_at)/1000):null;
  const run=job.execution_duration??(job.status==='RUNNING'&&job.started_at!==null?Math.max(0,(now-job.started_at)/1000):null);
  return `排队 ${format(queue)} · 运行 ${format(run)}`;
}
export function VideoGenerationHistory({draft,disabled,onLatestStatus,visible=true}:{visible?:boolean;draft:CreativeDraft;disabled:boolean;onLatestStatus:(status:string)=>void}){
  const router=useRouter();
  const [rounds,setRounds]=useState<VideoRound[]>([]),[selected,setSelected]=useState<string>(),[ready,setReady]=useState(false),[error,setError]=useState('');
  const chosen=useRef<string|undefined>(undefined),statusCallback=useRef(onLatestStatus);statusCallback.current=onLatestStatus;
  const scope=videoSession(JSON.parse(draft.input_json),draft.target_asset_id??draft.id);
  const key=`video.history.${CryptoJS.SHA256(`${draft.provider_id}:${draft.project_id}:${draft.shot_id}:${scope}`)}`;
  useEffect(()=>{let active=true;setReady(false);chosen.current=undefined;setSelected(undefined);SecureStore.getItemAsync(key).then(id=>{if(active&&id){chosen.current=id;setSelected(id);}}).catch(()=>undefined).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[key]);
  useEffect(()=>{
    let active=true,reading=false;
    const refresh=async()=>{if(reading)return;reading=true;try{
      const drafts=videoSessionDrafts(draft,await creativeService().drafts(draft.project_id??undefined)).filter(row=>row.job_id);
      const assets=new Map<string,AssetVersion[]>();
      await Promise.all([...new Set(drafts.map(row=>row.target_asset_id).filter((id):id is string=>Boolean(id)))].map(async id=>assets.set(id,await creativeService().versions(id))));
      const rows=await Promise.all(drafts.map(async row=>{const job=await getDatabase().getFirstAsync<Job>('SELECT id,status,created_at,started_at,execution_duration,updated_at FROM workflow_jobs WHERE id=?',row.job_id!);return job?{draft:row,job,versions:(assets.get(row.target_asset_id??'')??[]).filter(v=>v.recipe.jobId===job.id)}:null;}));
      const seen=new Set<string>(),next=rows.filter((r):r is VideoRound=>Boolean(r)).filter(r=>{if(seen.has(r.job.id))return false;seen.add(r.job.id);return true;}).sort((a,b)=>b.job.created_at-a.job.created_at||b.job.id.localeCompare(a.job.id));
      if(active){setRounds(next);setError('');const latest=next.find(r=>r.job.id===draft.job_id);if(latest)statusCallback.current(latest.job.status);}
    }catch{if(active)setError('生成记录读取失败，正在重试');}finally{reading=false;}};
    void refresh();const timer=setInterval(()=>void refresh(),2500);return()=>{active=false;clearInterval(timer);};
  },[draft.job_id,key]);
  const current=rounds.find(r=>r.job.id===selected)??rounds.find(r=>r.versions.some(v=>v.state==='AVAILABLE'))??rounds[0];
  const choose=(id:string)=>{chosen.current=id;setSelected(id);void SecureStore.setItemAsync(key,id).catch(()=>setError('预览位置未保存，当前选择仍可使用'));};
  if(!visible)return null;
  return <View style={{flex:1,minHeight:0}}>
    {error?<Text accessibilityRole="alert" style={{color:COLORS.danger,padding:8}}>{error}</Text>:null}
    {ready&&current?<View style={{flex:1,minHeight:0}}><CreativeResults key={current.job.id} draft={current.draft} dock taskDetail disabled={disabled} onlyJob />
      <View style={{paddingHorizontal:12}}><Text style={{fontSize:12,color:COLORS.textMuted}}>{creativeJobLabel(current.job.status)} · {videoRoundTimes(current.job)}</Text><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{fontSize:11,color:COLORS.textMuted,flex:1}} numberOfLines={1}>{current.draft.workflow_id} · {new Date(current.job.created_at).toLocaleString()}</Text><TextAction label="查看本轮任务" onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:current.job.id,returnToWorkbench:'1'}})}/></View></View>
    </View>:<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text style={{color:COLORS.textMuted}}>读取生成记录…</Text></View>}
    {selected&&rounds[0]&&current?.job.id!==rounds[0].job.id?<TextAction label="查看最新一轮" onPress={()=>choose(rounds[0].job.id)}/>:null}
    <FlatList horizontal testID="video-rounds" data={rounds} keyExtractor={r=>r.job.id} showsHorizontalScrollIndicator={false} style={{flexGrow:0,maxHeight:154}} contentContainerStyle={{padding:10,gap:8}} renderItem={({item,index})=><Pressable accessibilityRole="button" accessibilityLabel={`查看第 ${rounds.length-index} 轮视频`} accessibilityState={{selected:current?.job.id===item.job.id}} onPress={()=>choose(item.job.id)} style={{width:156,padding:6,gap:3,borderWidth:1,borderColor:current?.job.id===item.job.id?COLORS.primary:COLORS.border,borderRadius:10}}>
      <MediaPreview version={item.versions[0]} kind="video" label={`第 ${rounds.length-index} 轮封面`} style={{width:142,height:56,aspectRatio:undefined}}/>
      <Text numberOfLines={1} style={{fontSize:12,color:COLORS.text}}>第 {rounds.length-index} 轮 · {creativeJobLabel(item.job.status)}</Text>
      <Text numberOfLines={1} style={{fontSize:10,color:COLORS.textMuted}}>{videoRoundTimes(item.job)}</Text>
    </Pressable>}/>
  </View>;
}
