import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { creativeService } from './runtime';
import { creativeAccounts, creativeBudget } from './accountRuntime';
import { COLORS } from '../ui/theme';
import { ListAction } from '../ui/ListPageUI';
import type { CreativeProject } from './types';

export function AgentCreativePanel({ threadId, running }: { threadId:string; running:boolean }) {
  const router=useRouter();const [expanded,setExpanded]=useState(false),[projects,setProjects]=useState<CreativeProject[]>([]),[selected,setSelected]=useState<string|null>(null),[notice,setNotice]=useState(''),[limit,setLimit]=useState('1'),[busy,setBusy]=useState(false);
  const [receipts,setReceipts]=useState<Array<{id:string;command_name:string;result_json:string}>>([]);
  useEffect(()=>{if(!expanded)return;let active=true;const refresh=async()=>{
    const db=getDatabase();const scope=await db.getFirstAsync<{project_id:string|null}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',threadId);
    const rows=await creativeService().projects();
    const recent=await db.getAllAsync<{id:string;command_name:string;result_json:string}>('SELECT r.id,r.command_name,r.result_json FROM creative_command_receipts r JOIN creative_execution_origins o ON o.id=r.execution_origin_id WHERE o.thread_id=? ORDER BY r.created_at DESC LIMIT 8',threadId);
    if(active){setSelected(scope?.project_id??null);setProjects(rows);setReceipts(recent);}
  };void refresh().catch(()=>setNotice('创作范围读取失败'));const timer=setInterval(()=>{void refresh().catch(()=>undefined);},2000);return()=>{active=false;clearInterval(timer);};},[expanded,threadId]);
  const choose=async(projectId:string|null)=>{if(running||busy)return;setBusy(true);try{await withWriteTransaction(getDatabase(),async tx=>{
    if(!await tx.getFirstAsync('SELECT thread_id FROM agent_thread_index WHERE thread_id=? AND deleted=0',threadId))throw new Error('会话不存在');
    await tx.runAsync('INSERT INTO creative_agent_scopes VALUES(?,?,0,?) ON CONFLICT(thread_id) DO UPDATE SET project_id=excluded.project_id,revision=creative_agent_scopes.revision+1,updated_at=excluded.updated_at',threadId,projectId,Date.now());
  });setSelected(projectId);setNotice('范围已更新，下次工具调用将重新校验。');}catch(e){setNotice(e instanceof Error?e.message:'范围更新失败');}finally{setBusy(false);}};
  const grant=async(provider:'novelai'|'autodl')=>{
    if(!selected||busy)return;const count=Number(limit);if(!Number.isInteger(count)||count<1||count>20){setNotice('请填写 1–20 次有限授权');return;}
    try{const account=(await creativeAccounts().list()).find(a=>a.provider_id===provider);if(!account)throw new Error('请先在设置或创作草稿中绑定对应账号');
      Alert.alert(`授权 ${provider} 最多 ${count} 次生成`,`仅用于当前项目，1 小时内有效，费用未知且没有金额上限。发送后结果不明仍占用次数；切换账号会撤销授权。`,[{text:'取消',style:'cancel'},{text:'确认授权',onPress:()=>{setBusy(true);void creativeBudget().grant({provider,generationId:account.credential_generation_id,projectId:selected,operations:[provider==='novelai'?'image.generate':'video.generate'],requestLimit:count,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:count,expiresAt:Date.now()+3600000}).then(()=>setNotice('授权已创建，Agent 可以在次数范围内提交。')).catch(e=>setNotice(e.message)).finally(()=>setBusy(false));}}]);
    }catch(e){setNotice(e instanceof Error?e.message:'授权失败');}
  };
  const openReceipt=(json:string)=>{const r=JSON.parse(json);if(r.status==='accepted'){router.push('/(tabs)/tasks');return;}if(r.value?.draftId)router.push({pathname:r.value.provider==='novelai'||r.value.kind==='image'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:r.value.draftId}});else router.push('/(tabs)/projects');};
  return <View style={{padding:8,borderBottomWidth:1,borderBottomColor:COLORS.border,gap:8}}>
    <ListAction label={expanded?'收起创作范围与结果':'创作项目、授权与结果'} secondary onPress={()=>setExpanded(!expanded)} />
    {expanded?<>
      <Text style={{color:COLORS.text}}>当前范围：{projects.find(p=>p.id===selected)?.title??'尚未选择项目'}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{projects.map(p=><ListAction key={p.id} label={`${p.id===selected?'✓ ':''}${p.title}`} secondary disabled={running||busy} onPress={()=>void choose(p.id)} />)}<ListAction label="仅允许创建新项目" secondary disabled={running||busy} onPress={()=>void choose(null)} /></View>
      <TextInput accessibilityLabel="Agent 生成次数上限" keyboardType="number-pad" value={limit} onChangeText={setLimit} style={{color:COLORS.text,borderWidth:1,borderColor:COLORS.border,padding:8}} />
      <View style={{flexDirection:'row',gap:8}}><ListAction label="授权 NovelAI 次数" disabled={!selected||busy} onPress={()=>void grant('novelai')} /><ListAction label="授权 H3 次数" disabled={!selected||busy} onPress={()=>void grant('autodl')} /></View>
      <ListAction label="撤销当前项目全部生成授权" secondary disabled={!selected||busy} onPress={()=>{setBusy(true);void creativeBudget().list().then(async rows=>{for(const row of rows)if(row.project_id===selected&&row.revoked_at==null)await creativeBudget().revoke(row.id);setNotice('当前项目授权已撤销');}).catch(()=>setNotice('撤销失败')).finally(()=>setBusy(false));}} />
      {receipts.map(r=><ListAction key={r.id} label={`查看 ${r.command_name} 结果`} secondary onPress={()=>{const parsed=JSON.parse(r.result_json);if(parsed.value?.draftId)void creativeService().draft(parsed.value.draftId).then(d=>router.push({pathname:d?.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:parsed.value.draftId}}));else openReceipt(r.result_json);}} />)}
      {notice?<Text accessibilityLiveRegion="polite" style={{color:COLORS.textMuted}}>{notice}</Text>:null}
    </>:null}
  </View>;
}
