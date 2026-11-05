import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {ListAction} from '../ui/ListPageUI';
import {ParameterSheet} from './WorkbenchUI';
import {creativeUI as s} from './creativeUI';
import {readProjectAuthorizations,revokeReviewedProjectAuthorizations,type ProjectAuthorization} from './projectPermissionStore';

export function ProjectPermissions({projectId,title,onClose}:{projectId:string;title:string;onClose:()=>void}){
 const router=useRouter(),db=getDatabase();
 const [rows,setRows]=useState<ProjectAuthorization[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[shown,setShown]=useState(20);
 const generation=useRef(0),lock=useRef(false);
 useEffect(()=>()=>{generation.current++;},[]);
 const refresh=async()=>{
  const request=++generation.current;setLoading(true);setReview(false);setError('');
  try{const next=await readProjectAuthorizations(db,projectId);if(request===generation.current){setRows(next);setShown(20);}}
  catch{if(request===generation.current)setError('授权读取失败，请重新读取');}
  finally{if(request===generation.current)setLoading(false);}
 };
 useEffect(()=>{void refresh();return()=>{generation.current++;};},[db,projectId]);
 const revoke=async()=>{
  if(lock.current||!review)return;lock.current=true;setBusy(true);setError('');const request=generation.current;
  try{const count=await revokeReviewedProjectAuthorizations(db,projectId,rows);if(request===generation.current){setNotice(`已撤销 ${count} 项生成授权；任务与费用记录保留。`);await refresh();}}
  catch(reason){if(request===generation.current){setReview(false);setError(reason instanceof Error?reason.message:'撤销失败，请重新读取');}}
  finally{lock.current=false;if(request===generation.current||request+1===generation.current)setBusy(false);}
 };
 return <ParameterSheet fullScreen title="项目权限" onClose={()=>{if(!busy)onClose();}}>
  <Text style={s.title}>{title} · 生成授权</Text>
  <Text style={s.body}>以下是本项目尚未撤销且未到期的授权；实际提交仍需核对账号、版本、请求与余额。单次请求许可也包含在清单中。</Text>
  <Text style={s.muted}>撤销阻止尚未发送的请求，不取消供应商已接收的任务、不退款，也不删除任务或费用记录。素材外发许可单独管理。</Text>
  {loading?<Text accessibilityLiveRegion="polite" style={s.body}>正在读取授权…</Text>:null}
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  {notice?<Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>:null}
  {!loading&&!error&&!rows.length?<Text style={s.muted}>本项目没有尚未到期的生成授权。</Text>:null}
  {!loading?rows.slice(0,shown).map((row,index)=><View key={row.id} style={s.card}><Text style={s.title}>授权 {index+1} · {row.provider_id==='novelai'?'NovelAI':'AutoDL'}</Text><Text style={s.body}>{JSON.parse(row.allowed_operations_json).map((op:string)=>({'image.generate':'图片生成','video.generate':'视频生成','image.encodeReference':'图片参考编码'}[op]??op)).join('、')} · 最多 {row.request_limit} 次（含已使用）</Text><Text style={s.muted}>{row.amount_limit===null?'无金额上限':`金额上限 ${row.amount_limit} ${row.unit}`}{row.allow_unknown_cost?' · 允许费用未知请求':''}；到期 {new Date(row.expires_at).toLocaleString('zh-CN')}</Text></View>):null}
  {!loading&&shown<rows.length?<ListAction label={`显示更多授权（已显示 ${shown}/${rows.length}）`} secondary disabled={busy} onPress={()=>setShown(shown+20)}/>:null}
  {!loading&&rows.length>0&&!review?<ListAction label={`核对撤销本项目全部 ${rows.length} 项授权`} secondary disabled={busy||Boolean(error)||shown<rows.length} onPress={()=>setReview(true)}/>:null}
  {review?<View style={s.card}><Text style={s.body}>将撤销上述全部 {rows.length} 项授权。之后的生成需要重新审阅许可；已经发送的任务继续保留。</Text><ListAction label="确认撤销上述全部授权" disabled={busy} onPress={()=>void revoke()}/><ListAction label="保留授权，取消撤销" secondary disabled={busy} onPress={()=>setReview(false)}/></View>:null}
  <ListAction label="重新读取授权" secondary disabled={busy||loading} onPress={()=>void refresh()}/>
  <ListAction label="管理素材外发许可" secondary disabled={busy} onPress={()=>router.push({pathname:'/outbound-consents',params:{projectId}})}/>
 </ParameterSheet>;
}
