import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {FlatList,Pressable,Text,View,useWindowDimensions} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import {creativeService} from './runtime';
import {videoSession} from './videoDraftState';
import type {CreativeDraft} from './drafts';
import type {VideoHistoryJob,VideoHistoryRound} from './videoHistory';
import {CreativeResults} from './CreativeResults';
import {MediaPreview} from './MediaPreview';
import {TextAction} from './WorkbenchUI';
import {COLORS} from '../ui/theme';

type Job=VideoHistoryJob;
export type VideoRound=VideoHistoryRound;
export function videoRoundTimes(job:Job,now=Date.now()){
  const pending=['SUBMITTING','QUEUED','RUNNING','READY_TO_SUBMIT'].includes(job.status);
  const format=(seconds:number|null)=>seconds===null?'未记录':seconds<60?`${Math.floor(seconds)}秒`:`${Math.floor(seconds/60)}分${Math.floor(seconds%60)}秒`;
  const queue=job.started_at!==null?Math.max(0,(job.started_at-job.created_at)/1000):pending?Math.max(0,(now-job.created_at)/1000):null;
  const run=job.execution_duration??(job.status==='RUNNING'&&job.started_at!==null?Math.max(0,(now-job.started_at)/1000):null);
  return `排队 ${format(queue)} · 运行 ${format(run)}`;
}
export function VideoGenerationHistory({draft,disabled,onLatestStatus,visible=true}:{visible?:boolean;draft:CreativeDraft;disabled:boolean;onLatestStatus:(status:string)=>void}){
  const {width}=useWindowDimensions();
  const [expanded,setExpanded]=useState(false),[filter,setFilter]=useState('all');
  const [rounds,setRounds]=useState<VideoRound[]>([]),[selected,setSelected]=useState<string>(),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [nextPage,setNextPage]=useState<{createdAt:number;id:string}>(),[loadingMore,setLoadingMore]=useState(false);
  const pageCursor=useRef(nextPage);pageCursor.current=nextPage;
  const loadPage=useRef<()=>void>(()=>{});
  const [,setClock]=useState(0);
  const chosen=useRef<string|undefined>(undefined),statusCallback=useRef(onLatestStatus);statusCallback.current=onLatestStatus;
  const scope=videoSession(JSON.parse(draft.input_json),draft.target_asset_id??draft.id);
  const key=`video.history.${CryptoJS.SHA256(`${draft.provider_id}:${draft.project_id}:${draft.shot_id}:${scope}`)}`;
  useEffect(()=>{let active=true;setReady(false);setRounds([]);chosen.current=undefined;setSelected(undefined);SecureStore.getItemAsync(key).then(id=>{if(active&&id){chosen.current=id;setSelected(id);}}).catch(()=>undefined).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[key]);
  useFocusEffect(useCallback(()=>{
    if(!visible)return;
    let active=true,reading=false,needsRefresh=true,stamp='';
    const orderKey=`${key}.order`;
    const orderReady=SecureStore.getItemAsync(orderKey).then(raw=>{
      try{const value=JSON.parse(raw??'[]');return Array.isArray(value)&&value.every(id=>typeof id==='string')?value as string[]:[];}catch{return [];}
    }).catch(()=>[] as string[]);
    const refresh=async()=>{if(!active||reading||!needsRefresh)return;reading=true;try{
      const snapshot=await creativeService().videoHistory(draft,{}),next=snapshot.rounds;
      setNextPage(snapshot.next);
      if(chosen.current&&!next.some(r=>r.job.id===chosen.current)){const exact=await creativeService().videoHistory(draft,{jobId:chosen.current});next.push(...exact.rounds);}
      const order=await orderReady,previousOrder=order.length,ordinals=new Map(order.map((id,index)=>[id,index+1]));
      for(const row of [...next].reverse())if(!ordinals.has(row.job.id)){order.push(row.job.id);ordinals.set(row.job.id,order.length);}
      if(!active)return;
      if(order.length!==previousOrder)void SecureStore.setItemAsync(orderKey,JSON.stringify(order)).catch(()=>undefined);
      next.forEach(row=>{row.ordinal=row.ordinal??ordinals.get(row.job.id);});
      needsRefresh=next.some(row=>['READY_TO_SUBMIT','SUBMITTING','QUEUED','RUNNING','UNKNOWN'].includes(row.job.status)||['SUCCEEDED','PARTIAL_SUCCEEDED'].includes(row.job.status)&&(!row.versions.length||row.versions.some(v=>v.state==='PENDING')));
      if(snapshot.stamp!==stamp){setRounds(old=>[...next,...old.filter(r=>!next.some(n=>n.job.id===r.job.id))]);stamp=snapshot.stamp;}
      if(needsRefresh)setClock(value=>value+1);
      setError('');const latest=next.find(r=>r.job.id===draft.job_id);if(latest)statusCallback.current(latest.job.status);
    }catch{if(active)setError('生成记录读取失败，正在重试');}finally{reading=false;}};
    loadPage.current=()=>{if(reading||!active)return;reading=true;setLoadingMore(true);void creativeService().videoHistory(draft,{after:pageCursor.current}).then(page=>{if(active){setRounds(old=>[...old,...page.rounds.filter(r=>!old.some(o=>o.job.id===r.job.id))]);setNextPage(page.next);}}).catch(()=>{if(active)setError('更早记录读取失败，请重试');}).finally(()=>{reading=false;if(active)setLoadingMore(false);});};
    void refresh();const timer=setInterval(()=>void refresh(),2500);return()=>{active=false;clearInterval(timer);};
  },[draft.job_id,key,visible,ready]));
  const current=rounds.find(r=>r.job.id===selected)??rounds.find(r=>r.versions.some(v=>v.state==='AVAILABLE'))??rounds[0];
  const choose=(id:string)=>{chosen.current=id;setSelected(id);void SecureStore.setItemAsync(key,id).catch(()=>setError('预览位置未保存，当前选择仍可使用'));};
  useEffect(()=>{if(ready&&current&&!chosen.current){chosen.current=current.job.id;setSelected(current.job.id);}},[ready,current?.job.id]);
  if(!visible)return null;
  const pendingCount=rounds.filter(r=>['SUBMITTING','QUEUED','RUNNING','READY_TO_SUBMIT'].includes(r.job.status)).length;
  const filtered=rounds.filter(r=>filter==='all'||(filter==='done'?['SUCCEEDED','PARTIAL_SUCCEEDED'].includes(r.job.status):filter==='active'?['SUBMITTING','QUEUED','RUNNING','READY_TO_SUBMIT'].includes(r.job.status):['FAILED','CANCELLED','UNKNOWN'].includes(r.job.status)));
  const title=(r:VideoRound)=>{try{const raw=JSON.parse(r.draft.input_json);return raw.workflow?.title??'视频生成';}catch{return '视频生成';}};
  const shortStatus=(status:string)=>({SUCCEEDED:'已完成',PARTIAL_SUCCEEDED:'部分完成',FAILED:'未完成',CANCELLED:'已取消',UNKNOWN:'待核查',RUNNING:'生成中',QUEUED:'排队中'}[status]??'提交中');
  const listMode=expanded||width>=840;
  const records=<View style={width>=840?{width:300,borderLeftWidth:1,borderColor:COLORS.border}:listMode?{flex:1,minHeight:100}:{height:112}}>
    {listMode?<View style={{flexDirection:'row',paddingHorizontal:8}}>{[['all','全部'],['done','完成'],['active','进行中'],['failed','需关注']].map(([value,label])=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)} style={{padding:10}}><Text style={{fontSize:12,color:filter===value?COLORS.primary:COLORS.textMuted}}>{label}</Text></Pressable>)}</View>:null}
    <FlatList key={listMode?'list':'strip'} horizontal={!listMode} testID="video-rounds" data={listMode?filtered:rounds} keyExtractor={r=>r.job.id} showsHorizontalScrollIndicator={false} initialNumToRender={8} windowSize={5} contentContainerStyle={{padding:8,gap:6}}
      ListFooterComponent={nextPage?<TextAction label={loadingMore?"正在加载…":"加载更早记录"} disabled={loadingMore} onPress={()=>loadPage.current()}/>:null}
      ListEmptyComponent={()=> <Text style={{padding:12,color:COLORS.textMuted}}>暂无此类记录</Text>}
      renderItem={({item})=>{const ordinal=item.ordinal??rounds.length-rounds.indexOf(item),selected=current?.job.id===item.job.id;return <Pressable accessibilityRole="button" accessibilityLabel={`查看第 ${ordinal} 轮视频`} accessibilityState={{selected}} onPress={()=>choose(item.job.id)} style={{width:listMode?'100%':112,padding:4,gap:6,flexDirection:listMode?'row':'column',alignItems:listMode?'center':undefined,borderWidth:1,borderColor:selected?COLORS.primary:COLORS.border,borderRadius:8,backgroundColor:selected?COLORS.surfaceRaised:COLORS.surface}}>
        <MediaPreview version={item.versions.find(v=>v.state==='AVAILABLE')??item.versions[0]} kind="video" contain label={`第 ${ordinal} 轮封面`} style={{width:listMode?88:102,height:listMode?50:58,aspectRatio:undefined,borderRadius:5}}/>
        <View style={listMode?{flex:1,gap:3}:undefined}><Text numberOfLines={1} style={{fontSize:12,color:selected?COLORS.primary:COLORS.text}}>第 {ordinal} 轮 · {shortStatus(item.job.status)}</Text>
        {listMode?<><Text numberOfLines={1} style={{fontSize:11,color:COLORS.textMuted}}>{title(item)} · {new Date(item.job.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text><Text style={{fontSize:11,color:COLORS.textMuted}}>{videoRoundTimes(item.job)}</Text></>:null}</View>
      </Pressable>;}}/>
  </View>;
  return <View style={{flex:1,minHeight:0}}>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:12}}><Text style={{flex:1,fontSize:12,color:COLORS.textMuted}}>已加载 {rounds.length} 轮{pendingCount?` · ${pendingCount} 项进行中`:''}</Text>
      {selected&&rounds[0]&&current?.job.id!==rounds[0].job.id?<TextAction label="查看最新一轮" onPress={()=>choose(rounds[0].job.id)}/>:null}
      {width<840?<TextAction label={expanded?'收起记录':`全部记录 · ${rounds.length}`} onPress={()=>setExpanded(!expanded)}/>:null}
    </View>
    {error?<Text accessibilityRole="alert" style={{color:COLORS.danger,padding:8}}>{error}</Text>:null}
    <View style={{flex:1,minHeight:0,flexDirection:width>=840?'row':'column'}}>
      <View style={{flex:1,minHeight:0}}>{ready&&current?<>
        <CreativeResults key={current.job.id} draft={current.draft} dock taskDetail disabled={disabled} onlyJob previewVisible={visible}/>
        <View style={{paddingHorizontal:12,paddingBottom:6,gap:3}}><Text style={{fontSize:12,color:COLORS.textMuted}}>{shortStatus(current.job.status)} · {videoRoundTimes(current.job)}</Text><Text numberOfLines={1} style={{fontSize:11,color:COLORS.textMuted}}>{title(current)} · {new Date(current.job.created_at).toLocaleString()}</Text></View>
      </>:<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text style={{color:COLORS.textMuted}}>{ready?'暂无生成记录':'读取生成记录…'}</Text></View>}</View>
      {records}
    </View>
  </View>;
}
