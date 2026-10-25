import {TaskTiming} from './TaskCardRow';
import {useCallback,useState,useRef} from 'react';
import {Keyboard,Modal,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {taskProjectionEvents} from './taskProjectionEvents';
import {AppIcon} from '../ui/icons';
import {COLORS} from '../ui/theme';
import {TextAction} from '../creative/WorkbenchUI';
import {creativeJobLabel} from '../creative/CreativeResults';

type InboxRow={id:string;status:string;input_json:string;adapter_id?:string;creative?:number;created_at:number;updated_at:number;started_at?:number;execution_duration?:number};
export function TaskInboxButton(){
 const anchor=useRef<View>(null),[top,setTop]=useState(60);const {width,height}=useWindowDimensions();
 const router=useRouter();const [open,setOpen]=useState(false),[count,setCount]=useState(0),[attention,setAttention]=useState(0),[rows,setRows]=useState<InboxRow[]>([]),[error,setError]=useState('');
 useFocusEffect(useCallback(()=>{let active=true,reading=false;
  const refresh=async()=>{if(reading)return;reading=true;try{
   const db=getDatabase();
   const count=await db.getFirstAsync<{n:number;attention:number}>("SELECT SUM(CASE WHEN status NOT IN ('SUCCEEDED','PARTIAL_SUCCEEDED','FAILED','CANCELLED','UNKNOWN') THEN 1 ELSE 0 END) AS n,SUM(CASE WHEN status IN ('FAILED','UNKNOWN','PARTIAL_SUCCEEDED') THEN 1 ELSE 0 END) AS attention FROM workflow_jobs j WHERE NOT EXISTS(SELECT 1 FROM task_archives a WHERE a.task_id=j.id)");
   const rows=await db.getAllAsync<InboxRow>("SELECT j.id,j.status,j.input_json,j.adapter_id,j.created_at,j.updated_at,j.started_at,j.execution_duration,EXISTS(SELECT 1 FROM creative_job_contexts c WHERE c.job_id=j.id) AS creative FROM workflow_jobs j WHERE NOT EXISTS(SELECT 1 FROM task_archives a WHERE a.task_id=j.id) ORDER BY created_at DESC LIMIT 6");
   if(active){setCount(count?.n??0);setAttention(count?.attention??0);setRows(rows);setError('');}
  }catch{if(active)setError('任务状态暂不可用');}finally{reading=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),3000),unsubscribe=taskProjectionEvents.subscribe(()=>void refresh());
  return()=>{active=false;clearInterval(timer);unsubscribe();};
 },[]));
 return <><View ref={anchor} collapsable={false}><Pressable accessibilityRole="button" accessibilityLabel={`打开任务中心${count?`，${count} 个任务进行中`:''}`} onPress={()=>{Keyboard.dismiss();setOpen(true);anchor.current?.measureInWindow((_x,y,_w,h)=>{setTop(y+h+6);setOpen(true);});}} style={{width:36,height:40,alignItems:'center',justifyContent:'center'}}>
  <AppIcon name="list_alt" size={22}/>{count||attention?<View style={{position:'absolute',right:0,top:2,minWidth:16,borderRadius:8,backgroundColor:attention?COLORS.danger:COLORS.primary,paddingHorizontal:3}}><Text style={{color:'#fff',fontSize:10,textAlign:'center'}}>{count?count>99?'99+':count:'!'}</Text></View>:null}
 </Pressable></View>{open?<Modal visible transparent animationType="fade" onRequestClose={()=>setOpen(false)}><Pressable accessibilityRole="button" accessibilityLabel="关闭最近任务" onPress={()=>setOpen(false)} style={{flex:1,backgroundColor:'rgba(0,0,0,0.12)'}}/><View style={{position:'absolute',top:Math.max(16,Math.min(top,height-340)),right:8,width:Math.min(width-16,360),maxHeight:Math.min(420,height-90),backgroundColor:COLORS.surface,borderRadius:14,borderWidth:0.5,borderColor:COLORS.border,elevation:10,padding:12}}><Text style={{fontWeight:'600',color:COLORS.text,fontSize:14}}>最近任务{count?` · ${count} 进行中`:''}</Text><ScrollView>
  {error?<Text>{error}</Text>:null}
  {rows.map(row=>{let prompt='创作任务';try{const input=JSON.parse(row.input_json);prompt=typeof input.prompt==='string'?input.prompt:prompt;}catch{}
   return <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`查看任务 ${row.id}`} onPress={()=>{setOpen(false);router.push({pathname:row.creative?'/creative-task/[id]':'/video/[id]',params:{id:row.id}});}} style={{paddingVertical:10,borderBottomWidth:0.5,borderBottomColor:COLORS.border,gap:3}}><Text numberOfLines={1} style={{color:COLORS.text,fontSize:13}}>{prompt||'未命名创作'}</Text><Text style={{color:COLORS.textMuted,fontSize:11}}>{row.adapter_id==='novelai-image'?'图片':'视频'} · {creativeJobLabel(row.status)}</Text><TaskTiming compact task={{status:row.status==='SUCCEEDED'?'SUCCESS':row.status==='PARTIAL_SUCCEEDED'?'PARTIAL_SUCCESS':row.status==='RUNNING'?'RUNNING':row.status==='UNKNOWN'?'UNKNOWN':row.status==='FAILED'?'FAILED':row.status==='CANCELLED'?'CANCELLED':'QUEUED',createdAt:row.created_at,updatedAt:row.updated_at,startedAt:row.started_at,executionDuration:row.execution_duration}}/></Pressable>;
  })}{!rows.length&&!error?<Text>暂无任务</Text>:null}<TextAction label="全部任务" onPress={()=>{setOpen(false);router.navigate('/(tabs)/tasks');}}/>
 </ScrollView></View></Modal>:null}</>;
}
