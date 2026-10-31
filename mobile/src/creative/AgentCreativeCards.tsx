import {prepareCreativeVideo,confirmCreativeVideo} from './videoRuntime';
import {prepareCreativeImage,confirmCreativeImage} from './novelAiRuntime';
import { createContext, useContext, useCallback, useRef, useState, useEffect, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ImagePreview } from '../ui/ImagePreview';
import { MediaPreview } from './MediaPreview';
import { ParameterSheet } from './WorkbenchUI';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import { readAgentCreativeActivity, agentCreativeActivityLabel, agentCreativeActivitySummary, type AgentCreativeActivity } from './agentCreativeActivity';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { creativeBudget } from './accountRuntime';
import type { CreativeDraft } from './drafts';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';

const ActivityContext=createContext({cards:[] as AgentCreativeActivity[],allowance:{} as Record<string,number>,readError:'',loading:true});
export function AgentActivityProvider({threadId,children}:{threadId:string;children:ReactNode}) {
  const [cards,setCards]=useState<AgentCreativeActivity[]>([]),[allowance,setAllowance]=useState<Record<string,number>>({}),[readError,setReadError]=useState(''),[loading,setLoading]=useState(true);
  useFocusEffect(useCallback(() => {
    let active = true, reading = false;setCards([]);setReadError('');setLoading(true);
    const refresh = async () => {
      if (reading) return; reading = true;
      try {
        const db = getDatabase();
        const next=await readAgentCreativeActivity(db,threadId);
        const scope=await db.getFirstAsync<{project_id:string}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',threadId);
        const allowance: Record<string, number> = scope?.project_id ? { novelai: await creativeBudget().availableUnknownRequests(scope.project_id, 'novelai'), autodl: await creativeBudget().availableUnknownRequests(scope.project_id, 'autodl') } : {};
        if (active) { setCards(next); setAllowance(allowance); setReadError(''); setLoading(false); }
      } finally { reading = false; }
    };
    void refresh().catch(() => { if (active) setReadError('创作状态读取失败，正在重试'); });
    const timer = setInterval(() => void refresh().catch(() => {if(active)setReadError('创作状态读取失败，正在重试');}), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [threadId]));
  return <ActivityContext.Provider value={{cards,allowance,readError,loading}}>{children}</ActivityContext.Provider>;
}

export function AgentCreativeCards({ threadId, running, runId }: { threadId: string; running: boolean; runId?:string }) {
  const router=useRouter();
  const state=useContext(ActivityContext);
  const cards=runId?state.cards.filter(card=>card.runId===runId):state.cards;
  const {allowance,readError,loading}=state;
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[open,setOpen]=useState(false),[preview,setPreview]=useState<string>();
  const lock=useRef(false);
  useEffect(()=>{setOpen(false);setPreview(undefined);setError('');setNotice('');},[threadId,runId]);
  const grant = async (draft: CreativeDraft) => {
    if (!draft.project_id || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const release = () => { lock.current = false; setBusy(false); };
    try {
      const provider = draft.provider_id === 'novelai' ? 'novelai' : 'autodl';
      const scope = await getDatabase().getFirstAsync<{ project_id: string }>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
      if (scope?.project_id !== draft.project_id) throw new Error('当前项目已切换，请查看当前项目的草稿');
      const db=getDatabase();
      if(await db.getFirstAsync('SELECT id FROM creative_plan_steps WHERE draft_id=?',draft.id))throw new Error('此草稿属于生产计划，请在计划中授权并继续');
      const preview=provider==='novelai'?await prepareCreativeImage(draft.id):await prepareCreativeVideo(draft.id);
      if(preview.draft.revision!==draft.revision)throw new Error('草稿已变化，请刷新后重新确认');
      const snapshot=preview.prepared.inputSnapshot;
      const spec=JSON.stringify(Object.fromEntries(Object.entries(snapshot).filter(([key,value])=>['model','resolution','duration','width','height','seed'].includes(key)&&['string','number'].includes(typeof value))));
      Alert.alert('确认并生成这份草稿', `草稿 ${draft.id.slice(-8)} · 修订 ${preview.draft.revision}。使用 ${provider} 当前绑定账号，固定 ${preview.versionIds.length} 个素材版本。规格：${spec}。仅允许此请求生成 1 次，15 分钟有效；费用未知，没有金额上限。确认后直接入队，无需再次发送消息。`, [
        {text:'取消',style:'cancel',onPress:release},
        {text:'确认生成 1 次',onPress:()=>void (async()=>{
          if(getDatabase()!==db)throw new Error('数据库已切换，请重新确认');
          const current=await db.getFirstAsync<{project_id:string}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',threadId);
          if(current?.project_id!==draft.project_id)throw new Error('项目范围已改变，请重新确认');
          const task=provider==='novelai'?await confirmCreativeImage(preview as Awaited<ReturnType<typeof prepareCreativeImage>>):await confirmCreativeVideo(preview as Awaited<ReturnType<typeof prepareCreativeVideo>>);
          setNotice(`已加入生成队列 · ${task.id.slice(-8)}。结果将作为候选，仍需审阅采用。`);
        })().catch(e=>setError(e instanceof Error?e.message:'提交失败，请检查原任务后再操作')).finally(release)},
      ],{cancelable:false});
    } catch (e) { setError(e instanceof Error ? e.message : '授权失败'); release(); }
  };
  const image=cards.flatMap(card=>card.outputs).find(output=>output.state==='AVAILABLE' && output.relativePath && output.mime?.startsWith('image/'));
  const summary=readError || (loading?'正在读取创作状态…':agentCreativeActivitySummary(cards));
  if(runId && !cards.length)return null;
  return <View>
    <Pressable testID="agent-creative-summary" accessibilityRole="button" accessibilityLabel={`${runId?'本轮成果':'本会话创作'}，${summary}`} onPress={()=>setOpen(true)} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8}}>
      {image?<MediaPreview version={image} label="最新生成图片" style={{width:32,height:32,borderRadius:4}}/>:<AppIcon name="image" size={18} color={COLORS.primary}/>}
      <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{flex:1,color:COLORS.textMuted,fontSize:12}}>{runId?'本轮成果':'本会话创作'} · {summary}</Text><AppIcon name="chevron_right" size={18}/>
    </Pressable>
    {open?<ParameterSheet title={runId?'本轮的创作':'本会话的创作'} onClose={()=>setOpen(false)}>
      {!cards.length?<Text style={s.muted}>{readError || (loading?'正在读取创作状态…':'尚未创建生成任务。助手准备好草稿后，可在这里查看草稿、授权和实际成果。')}</Text>:null}
      {cards.map(card=><View key={card.id} style={s.card}>
        <Text style={s.title}>{card.name}</Text>
        <Text accessibilityLiveRegion="polite" style={s.muted}>{agentCreativeActivityLabel(card)}</Text>
        {card.draft?<>
          <Text style={s.body} numberOfLines={3}>{JSON.parse(card.draft.input_json).prompt || JSON.parse(card.draft.input_json).values?.prompt || '待补充描述'}</Text>
          {card.outputs.length?<ScrollView horizontal contentContainerStyle={{gap:8}}>{card.outputs.map(output=><Pressable key={output.id} accessibilityRole="button" accessibilityLabel={`查看生成成果 ${output.versionNo}`} disabled={output.state!=='AVAILABLE' || !output.relativePath} onPress={()=>{
            if(output.mime?.startsWith('image/'))setPreview(`${FileSystem.documentDirectory}${output.relativePath}`);
            else {setOpen(false);router.push({pathname:'/creative-output/[id]',params:{id:output.id,assetId:output.assetId,jobId:card.jobId??card.draft!.job_id??'',draftId:card.draft!.id}});}
          }}><MediaPreview version={output} kind={card.draft!.provider_id==='novelai'?'image':'video'} label={`生成成果 ${output.versionNo}`} style={{width:180,height:180}} contain/></Pressable>)}</ScrollView>:null}
          <ListAction label={card.draft.state==='EDITING'?'编辑这份草稿':'查看成果与进度'} secondary onPress={()=>{setOpen(false);router.push({pathname:card.draft!.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:card.draft!.id}});}}/>
          {card.jobId?<ListAction label="查看生成任务详情" secondary onPress={()=>{setOpen(false);router.push({pathname:'/creative-task/[id]',params:{id:card.jobId!}});}}/>:null}
          {card.draft.state==='EDITING'?<ListAction label="确认这份草稿并生成" secondary disabled={busy||running} onPress={()=>void grant(card.draft!)}/>:null}
        </>:<ListAction label="查看并处理" onPress={()=>{setOpen(false);router.push({pathname:'/creative-project/[id]',params:{id:card.projectId!,tab:card.kind==='proposal'?'activity':'plans',...(card.kind==='proposal'?{proposalId:card.id}:{planId:card.id}),requestId:String(Date.now())}});}}/>}
      </View>)}
      {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
      {error||readError?<Text accessibilityRole="alert" style={s.error}>{error||readError}</Text>:null}
    </ParameterSheet>:null}
    <ImagePreview uri={preview??null} onClose={()=>setPreview(undefined)}/>
  </View>;
}
