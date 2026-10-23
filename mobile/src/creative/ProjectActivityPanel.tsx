import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {creativeService} from './runtime';
import {readProjectActivity,type ProjectActivity as Entry} from './projectActivity';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
import {createId} from '../ids';
import type {ChangeProposal} from './changeReview';
export function ProjectActivity({projectId}:{projectId:string}){
  const router=useRouter(),[rows,setRows]=useState<Entry[]>([]),[error,setError]=useState('');
  const [proposals,setProposals]=useState<ChangeProposal[]>([]),[busy,setBusy]=useState(false),lock=useRef(false);
  useEffect(()=>{let live=true;const load=async()=>{const p=await getDatabase().getAllAsync<ChangeProposal>("SELECT * FROM creative_change_proposals WHERE project_id=? AND state='WAITING' ORDER BY created_at DESC LIMIT 30",projectId);if(live)setProposals(p);};void load().catch(()=>setError('建议读取失败'));const timer=setInterval(()=>void load().catch(()=>undefined),2000);return()=>{live=false;clearInterval(timer);};},[projectId]);
  const resolve=async(id:string,accept:boolean)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await creativeService().execute({name:'change.resolve',payload:{id,accept}},createId());setProposals(p=>p.filter(v=>v.id!==id));}catch(e){setError(e instanceof Error?e.message:'处理失败');}finally{lock.current=false;setBusy(false);}};
  useEffect(()=>{let live=true;const refresh=async()=>{try{const rows=await readProjectActivity(getDatabase(),projectId);if(live)setRows(rows);}catch{if(live)setError('活动读取失败');}};void refresh();const timer=setInterval(()=>void refresh(),3000);return()=>{live=false;clearInterval(timer);};},[projectId]);
  return <View style={{gap:12}}><Text style={{color:COLORS.text,fontSize:20,fontWeight:'700'}}>项目活动</Text>
    {error?<Text style={{color:COLORS.danger}}>{error}</Text>:null}
    {proposals.map(p=><View key={p.id} style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:10,gap:8}}>
      <Text style={{color:COLORS.text,fontWeight:'700'}}>Agent 修改建议 · 待审阅</Text>
      {Object.entries(JSON.parse(p.before_json) as Record<string,string>).map(([field,before])=><View key={field} style={{gap:4}}>
        <Text style={{color:COLORS.textMuted}}>{({title:'名称',brief:'简报',description:'镜头描述',status:'状态'} as Record<string,string>)[field]??field} · 原内容</Text><Text selectable style={{color:COLORS.text}}>{before||'（空）'}</Text>
        <Text style={{color:COLORS.textMuted}}>建议改为</Text><Text selectable style={{color:COLORS.text}}>{JSON.parse(p.payload_json)[field]||'（空）'}</Text>
      </View>)}
      <ListAction label="采用这项修改" disabled={busy} onPress={()=>void resolve(p.id,true)}/><ListAction label="拒绝建议" secondary disabled={busy} onPress={()=>void resolve(p.id,false)}/>
      <Text style={{color:COLORS.textMuted}}>若原内容已被编辑，采用会提示修订冲突；不会覆盖较新的内容。</Text>
    </View>)}
    {!rows.length?<Text style={{color:COLORS.textMuted}}>尚无活动。</Text>:null}
    {rows.map(r=><View key={`${r.kind}:${r.id}`} style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:10,gap:6}}>
      <Text style={{color:COLORS.text}}>{r.label} · {r.state}</Text><Text style={{color:COLORS.textMuted}}>{new Date(r.createdAt).toLocaleString()} · {r.origin==='agent'?'Agent':r.origin==='user'?'手动操作':r.origin==='executor'?'执行器':'计划'}</Text>
      {r.jobId?<ListAction label="查看任务" secondary onPress={()=>router.push('/(tabs)/tasks')}/>:r.draftId?<ListAction label="查看草稿" secondary onPress={()=>void creativeService().draft(r.draftId!).then(d=>{if(d)router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}});}).catch(()=>setError('草稿读取失败'))}/>:null}
    </View>)}
  </View>;
}
