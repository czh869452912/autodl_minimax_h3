import {IconAction} from './WorkbenchUI';
import {useLiveRefresh} from './useLiveRefresh';
import {activityLabel,activityState} from './activityPresentation';
import {useEffect,useRef,useState} from 'react';
import {ProposalReviewCard} from './ProposalReviewCard';
import {readProposalReview,type ProposalReview} from './proposalPresentation';
import {creativeError} from './creativeError';
import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {creativeService} from './runtime';
import {readProjectActivity,type ProjectActivity as Entry} from './projectActivity';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
import {createId} from '../ids';
import type {ChangeProposal} from './changeReview';
export function ProjectActivity({projectId,initialProposalId}:{projectId:string;initialProposalId?:string}){
  const router=useRouter(),[rows,setRows]=useState<Entry[]>([]),[diagnostic,setDiagnostic]=useState<string>(),[error,setError]=useState('');
  const [reviews,setReviews]=useState<ProposalReview[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [expanded,setExpanded]=useState(initialProposalId),[loading,setLoading]=useState(true);
  const lock=useRef(false),reads=useRef(0),retained=useRef<string[]>([]),owner=useRef('');
  const identity=`${projectId}:${initialProposalId??''}`;
  owner.current=identity;
  useEffect(()=>{owner.current=identity;setLoading(true);setBusy(false);setExpanded(initialProposalId);setReviews([]);setRows([]);setError('');setNotice('');retained.current=[];reads.current++;return()=>{owner.current='';reads.current++;};},[identity]);
  const load=async(current:()=>boolean)=>{
    const read=++reads.current,db=getDatabase();
    const kept=retained.current;
    const [rows,proposals]=await Promise.all([readProjectActivity(db,projectId),db.getAllAsync<ChangeProposal>(`SELECT * FROM creative_change_proposals WHERE project_id=? AND ((? IS NULL AND (state='WAITING'${kept.length?` OR id IN (${kept.map(()=>'?').join(',')})`:''})) OR id=?) ORDER BY created_at DESC LIMIT 30`,projectId,initialProposalId??null,...kept,initialProposalId??null)]);
    const next=await Promise.all(proposals.map(p=>readProposalReview(db,p)));
    if(current()&&owner.current===identity&&read===reads.current&&db===getDatabase()){setRows(rows);setReviews(next);setLoading(false);}
  };
  const resolve=async(id:string,accept:boolean)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');reads.current++;
    const origin=identity,db=getDatabase(),current=()=>owner.current===origin&&db===getDatabase();
    try{
      const proposal=await db.getFirstAsync<ChangeProposal>('SELECT * FROM creative_change_proposals WHERE id=? AND project_id=?',id,projectId);
      if(!current())return;
      if(!proposal)throw Error('建议已不可用，请返回后重试。');
      await creativeService().execute({name:'change.resolve',payload:{id,accept}},createId());
      if(current()){retained.current=[...new Set([...retained.current,id])];setNotice(accept?'修改已采用，未提交生成。':'建议已拒绝，目标内容未改变。');}
    }catch(e){if(current())setError(e instanceof Error&&e.message==='REVISION_CONFLICT'?'原内容已有新修订，未覆盖当前内容。请查看当前内容与原建议，再决定是否拒绝。':creativeError(e,'处理失败，请重试'));}
    finally{if(current()){try{await load(current);}catch{setError('处理结果暂时无法读取，请重新打开此建议核对。');}}lock.current=false;if(owner.current===origin)setBusy(false);}
  };
  useLiveRefresh(async current=>{try{await load(current);}catch{if(current()&&owner.current===identity){setError('活动读取失败');setLoading(false);}}},3000,identity);
  return <View style={{gap:12}}><Text accessibilityRole="header" style={{color:COLORS.text,fontSize:20,fontWeight:'700'}}>项目活动</Text>
    {error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={{color:COLORS.textMuted}}>{notice}</Text>:null}
    <Text accessibilityRole="header" style={{color:COLORS.text,fontSize:16,fontWeight:'600'}}>{initialProposalId?'当前修改建议':`待审阅建议 · ${reviews.filter(r=>r.proposal.state==='WAITING').length}`}</Text>
    {loading?<Text style={{color:COLORS.textMuted}}>正在读取修改建议…</Text>:initialProposalId&&!reviews.length&&!error?<Text style={{color:COLORS.textMuted}}>指定建议已不可用或不属于此项目。</Text>:null}
    {reviews.map(review=><ProposalReviewCard key={review.proposal.id} review={review} expanded={expanded===review.proposal.id} onToggle={()=>setExpanded(expanded===review.proposal.id?undefined:review.proposal.id)} onResolve={accept=>void resolve(review.proposal.id,accept)} busy={busy}/>)}
    <Text accessibilityRole="header" style={{color:COLORS.text,fontSize:16,fontWeight:'600'}}>已记录的活动</Text>
    {!rows.length?<Text style={{color:COLORS.textMuted}}>尚无活动。</Text>:null}
    {rows.map(r=><View key={`${r.kind}:${r.id}`} style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:10,gap:6}}>
      <Text style={{color:COLORS.text,paddingRight:40}}>{r.kind==='command'?activityLabel(r.label):r.label} · {activityState(r.state)}</Text><Text style={{color:COLORS.textMuted}}>{new Date(r.createdAt).toLocaleString()} · {r.origin==='agent'?'Agent':r.origin==='user'?'手动操作':r.origin==='executor'?'执行器':'计划'}</Text>
      <View style={{position:'absolute',right:4,top:2}}><IconAction label={diagnostic===r.id?'收起诊断详情':'诊断详情'} icon="more_horiz" onPress={()=>setDiagnostic(diagnostic===r.id?undefined:r.id)}/></View>
      {diagnostic===r.id?<Text selectable style={{color:COLORS.textMuted}}>{r.label} · {r.state} · {r.id}</Text>:null}
      {r.jobId?<ListAction label="查看任务" secondary onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:r.jobId!}})}/>:r.draftId?<ListAction label="查看草稿" secondary onPress={()=>void creativeService().draft(r.draftId!).then(d=>{if(d)router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}});}).catch(()=>setError('草稿读取失败'))}/>:null}
    </View>)}
  </View>;
}
