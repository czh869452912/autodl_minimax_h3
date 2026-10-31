import {TaskOutputThumbnail} from './TaskOutputThumbnail';
import {TaskTiming} from './TaskCardRow';
import {useCallback,useState,useRef} from 'react';
import {Keyboard,Modal,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {taskProjectionEvents} from './taskProjectionEvents';
import {AppIcon} from '../ui/icons';
import {COLORS} from '../ui/theme';
import {IconAction,TextAction} from '../creative/WorkbenchUI';
const inboxStatus:Record<string,string>={DRAFT:'准备中',VALIDATING:'检查中',READY_TO_SUBMIT:'等待提交',SUBMITTING:'提交中',QUEUED:'排队中',RUNNING:'生成中',SUCCEEDED:'已完成',PARTIAL_SUCCEEDED:'部分完成',FAILED:'失败',CANCELLED:'已取消',UNKNOWN:'待核查'};

type InboxRow={id:string;status:string;input_json:string;adapter_id?:string;creative?:number;created_at:number;updated_at:number;started_at?:number;execution_duration?:number};
export function TaskInboxButton({beforeOpen}:{beforeOpen?:()=>Promise<boolean>}={}){
 const anchor=useRef<View>(null),[top,setTop]=useState(60);const {width,height}=useWindowDimensions();
 const panelTop=Math.max(8,Math.min(top,height-180));
 const router=useRouter();const [open,setOpen]=useState(false),[count,setCount]=useState(0),[attention,setAttention]=useState(0),[rows,setRows]=useState<InboxRow[]>([]),[error,setError]=useState('');
 useFocusEffect(useCallback(()=>{let active=true,reading=false;
  const refresh=async()=>{if(reading)return;reading=true;try{
   const db=getDatabase();
   const count=await db.getFirstAsync<{n:number;attention:number}>("SELECT SUM(CASE WHEN status NOT IN ('SUCCEEDED','PARTIAL_SUCCEEDED','FAILED','CANCELLED','UNKNOWN') THEN 1 ELSE 0 END) AS n,SUM(CASE WHEN status IN ('FAILED','UNKNOWN','PARTIAL_SUCCEEDED') THEN 1 ELSE 0 END) AS attention FROM workflow_jobs j WHERE NOT EXISTS(SELECT 1 FROM task_removals r WHERE r.task_id=j.id) AND NOT EXISTS(SELECT 1 FROM task_archives a WHERE a.task_id=j.id)");
   const rows=await db.getAllAsync<InboxRow>("SELECT j.id,j.status,j.input_json,j.adapter_id,j.created_at,j.updated_at,j.started_at,j.execution_duration,EXISTS(SELECT 1 FROM creative_job_contexts c WHERE c.job_id=j.id) AS creative FROM workflow_jobs j WHERE NOT EXISTS(SELECT 1 FROM task_removals r WHERE r.task_id=j.id) AND NOT EXISTS(SELECT 1 FROM task_archives a WHERE a.task_id=j.id) ORDER BY created_at DESC LIMIT 6");
   if(active){setCount(count?.n??0);setAttention(count?.attention??0);setRows(rows);setError('');}
  }catch{if(active)setError('任务状态暂不可用');}finally{reading=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),3000),unsubscribe=taskProjectionEvents.subscribe(()=>void refresh());
  return()=>{active=false;clearInterval(timer);unsubscribe();};
 },[]));
 return <><View ref={anchor} collapsable={false}><Pressable accessibilityRole="button" accessibilityLabel={`打开任务中心${count?`，${count} 个任务进行中`:''}`} onPress={()=>{void (async()=>{if(beforeOpen&&!await beforeOpen())return;Keyboard.dismiss();setOpen(true);anchor.current?.measureInWindow((_x,y,_w,h)=>{setTop(y+h+6);setOpen(true);});})();}} style={{width:48,minHeight:48,alignItems:'center',justifyContent:'center'}}>
  <AppIcon name="list_alt" size={20}/><Text style={{fontSize:10,color:COLORS.textMuted}}>任务</Text>{count||attention?<View style={{position:'absolute',right:0,top:2,minWidth:16,borderRadius:8,backgroundColor:attention?COLORS.danger:COLORS.primary,paddingHorizontal:3}}><Text style={{color:'#fff',fontSize:10,textAlign:'center'}}>{count?count>99?'99+':count:'!'}</Text></View>:null}
 </Pressable></View>{open?<Modal visible transparent animationType="fade" onRequestClose={()=>setOpen(false)}><Pressable accessibilityRole="button" accessibilityLabel="关闭最近任务" onPress={()=>setOpen(false)} style={{flex:1,backgroundColor:'rgba(0,0,0,0.12)'}}/><View style={{position:'absolute',top:panelTop,right:8,width:Math.min(width-16,360),maxHeight:Math.max(120,Math.min(540,height-panelTop-16)),backgroundColor:COLORS.surface,borderRadius:14,borderWidth:0.5,borderColor:COLORS.border,elevation:10,overflow:'hidden'}}><View style={{paddingHorizontal:14,paddingVertical:8,flexDirection:'row',alignItems:'center',borderBottomWidth:0.5,borderBottomColor:COLORS.border}}><View style={{flex:1,gap:2}}><Text style={{fontWeight:'600',color:COLORS.text,fontSize:15}}>最近任务</Text><Text style={{fontSize:11,color:COLORS.textMuted}}>{[count?count+' 进行中':'',attention?attention+' 待处理':''].filter(Boolean).join(' · ')||'最近 6 次创作'}</Text></View><IconAction label="收起最近任务" icon="close" onPress={()=>setOpen(false)}/></View><ScrollView style={{flexShrink:1}} keyboardShouldPersistTaps="handled">
  {error?<Text accessibilityRole="alert" style={{padding:14,color:COLORS.danger,fontSize:12}}>{error}</Text>:null}
  {rows.map(row=>{let prompt='创作任务';try{const input=JSON.parse(row.input_json);prompt=typeof input.prompt==='string'?input.prompt:prompt;}catch{}
   const failed=['FAILED','UNKNOWN','PARTIAL_SUCCEEDED'].includes(row.status),complete=row.status==='SUCCEEDED',cancelled=row.status==='CANCELLED';
   const color=failed?COLORS.danger:complete?COLORS.success:cancelled?COLORS.textMuted:COLORS.primary;
   return <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`查看任务 ${row.id}`} onPress={()=>{setOpen(false);router.push({pathname:row.creative?'/creative-task/[id]':'/video/[id]',params:{id:row.id}});}} style={({pressed})=>({padding:12,borderBottomWidth:0.5,borderBottomColor:COLORS.border,gap:8,backgroundColor:pressed?COLORS.surfaceRaised:COLORS.surface})}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}><Text style={{color:COLORS.textMuted,fontSize:11}}>{row.adapter_id==='novelai-image'?'图片生成':'视频生成'}</Text><Text style={{color,fontSize:11,fontWeight:'600'}}>{inboxStatus[row.status]??'读取中'}</Text></View><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><TaskOutputThumbnail id={row.id} updatedAt={row.updated_at} video={row.adapter_id!=='novelai-image'}/><View style={{flex:1,gap:5}}><Text numberOfLines={2} style={{color:COLORS.text,fontSize:13,lineHeight:19,fontWeight:'500'}}>{prompt||'未命名创作'}</Text><TaskTiming compact task={{status:row.status==='SUCCEEDED'?'SUCCESS':row.status==='PARTIAL_SUCCEEDED'?'PARTIAL_SUCCESS':row.status==='RUNNING'?'RUNNING':row.status==='UNKNOWN'?'UNKNOWN':row.status==='FAILED'?'FAILED':row.status==='CANCELLED'?'CANCELLED':'QUEUED',createdAt:row.created_at,updatedAt:row.updated_at,startedAt:row.started_at,executionDuration:row.execution_duration}}/></View><AppIcon name={complete&&row.adapter_id!=='novelai-image'?"play_arrow":"chevron_right"} size={18} color={COLORS.textMuted}/></View></Pressable>;
  })}{!rows.length&&!error?<View style={{padding:24,alignItems:'center',gap:6}}><AppIcon name="list_alt" size={28}/><Text style={{color:COLORS.text,fontSize:13}}>暂无任务</Text><Text style={{color:COLORS.textMuted,fontSize:12}}>生成后的进度和结果会显示在这里</Text></View>:null}</ScrollView><View testID="recent-tasks-footer" style={{borderTopWidth:0.5,borderTopColor:COLORS.border,paddingHorizontal:12}}><TextAction label="全部任务" onPress={()=>{setOpen(false);router.navigate('/(tabs)/tasks');}}/>
 </View></View></Modal>:null}</>;
}
