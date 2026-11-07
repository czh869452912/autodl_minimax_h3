import {GenerationRequestReview,type GenerationPreview} from './GenerationRequestReview';
import {CreativeAccountPanel} from './CreativeAccountPanel';
import {prepareCreativeVideo,confirmCreativeVideo} from './videoRuntime';
import {prepareCreativeImage,confirmCreativeImage} from './novelAiRuntime';
import { createContext, useContext, useCallback, useRef, useState, useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
import {proposalChanges} from './proposalPresentation';
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
  const lock=useRef(false),submitting=useRef(false),owner=useRef('');
  const identity=`${threadId}:${runId??''}:${running}`;owner.current=identity;
  const [request,setRequest]=useState<{preview:GenerationPreview;identity:string;projectTitle?:string}>();
  const [recovery,setRecovery]=useState<{draft:CreativeDraft;message:string}>();
  useEffect(()=>()=>{owner.current='';},[]);
  useEffect(()=>{setRequest(undefined);setRecovery(undefined);lock.current=false;setBusy(false);},[identity,running]);
  const closeRequest=()=>{if(submitting.current)return;setRequest(undefined);setError('');lock.current=false;setBusy(false);};
  const confirmRequest=async()=>{
    if(!request||submitting.current||running)return;
    const {preview,identity:origin}=request,db=preview.db;
    const current=()=>owner.current===origin&&getDatabase()===db;
    submitting.current=true;setBusy(true);setError('');
    try{
      if(!current())throw Error('会话或数据库已变化，请重新核对');
      const scope=await db.getFirstAsync<{project_id:string}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',threadId);
      if(!current()||scope?.project_id!==preview.draft.project_id)throw Error('项目范围已改变，请重新核对');
      if(await db.getFirstAsync('SELECT id FROM creative_plan_steps WHERE draft_id=?',preview.draft.id))throw Error('此草稿已归入计划，请在计划中重新审阅');
      if(!current())throw Error('会话或数据库已变化，请重新核对');
      const task=preview.draft.provider_id==='novelai'?await confirmCreativeImage(preview as Awaited<ReturnType<typeof prepareCreativeImage>>):await confirmCreativeVideo(preview as Awaited<ReturnType<typeof prepareCreativeVideo>>);
      if(current()){setRequest(undefined);setNotice(`已加入生成队列 · ${task.id.slice(-8)}。结果将作为候选，仍需审阅采用。`);}
    }catch(e){if(current()){setRequest(undefined);setError(e instanceof Error?e.message:'提交结果无法确定，请检查原任务后再操作');}}
    finally{submitting.current=false;lock.current=false;if(owner.current===origin)setBusy(false);}
  };
  useEffect(()=>{setOpen(false);setPreview(undefined);setError('');setNotice('');},[threadId,runId]);
  const grant = async (draft: CreativeDraft) => {
    if (!draft.project_id || lock.current) return;
    const origin=identity,db=getDatabase();
    const current=()=>owner.current===origin&&db===getDatabase();
    lock.current = true; setBusy(true); setError('');setRecovery(undefined);
    const release = () => { if(current()){lock.current = false; setBusy(false);} };
    try {
      const provider = draft.provider_id === 'novelai' ? 'novelai' : 'autodl';
      const scope = await getDatabase().getFirstAsync<{ project_id: string }>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
      if (scope?.project_id !== draft.project_id) throw new Error('当前项目已切换，请查看当前项目的草稿');
      if(await db.getFirstAsync('SELECT id FROM creative_plan_steps WHERE draft_id=?',draft.id))throw new Error('此草稿属于生产计划，请在计划中授权并继续');
      const preview=provider==='novelai'?await prepareCreativeImage(draft.id):await prepareCreativeVideo(draft.id);
      if(preview.draft.revision!==draft.revision)throw new Error('草稿已变化，请刷新后重新确认');
      if(!current()){release();return;}
      const project=await db.getFirstAsync<{title:string}>('SELECT title FROM creative_projects WHERE id=?',draft.project_id);
      if(!current()){release();return;}
      setRequest({preview,identity:origin,projectTitle:project?.title});setBusy(false);
    } catch (e) { if(current())setRecovery({draft,message:e instanceof Error ? e.message : '请求准备失败'}); release(); }
  };
  const image=cards.flatMap(card=>card.outputs).find(output=>output.state==='AVAILABLE' && output.relativePath && output.mime?.startsWith('image/'));
  const summary=readError || (loading?'正在读取创作状态…':agentCreativeActivitySummary(cards));
  if(runId && !cards.length)return null;
  return <View>
    <Pressable testID="agent-creative-summary" accessibilityRole="button" accessibilityLabel={`${runId?'本轮创作':'本会话创作'}，${summary}`} onPress={()=>setOpen(true)} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8}}>
      {image?<MediaPreview version={image} label="最新生成图片" style={{width:32,height:32,borderRadius:4}}/>:<AppIcon name="image" size={18} color={COLORS.primary}/>}
      <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{flex:1,color:COLORS.textMuted,fontSize:12}}>{runId?'本轮创作':'本会话创作'} · {summary}</Text><AppIcon name="chevron_right" size={18}/>
    </Pressable>
    {request?<GenerationRequestReview key={`${request.preview.draft.id}:${request.preview.draft.revision}`} projectTitle={request.projectTitle} preview={request.preview} onClose={closeRequest} onConfirm={confirmRequest} error={error} busy={busy}/>:null}
    {recovery?<ParameterSheet title="请求尚未就绪" fullScreen onClose={()=>setRecovery(undefined)}>
      <Text accessibilityRole="alert" style={s.error}>{recovery.message}</Text>
      <Text style={s.body}>仍保留原草稿。保存账号或编辑草稿都不会提交生成；返回后需要重新准备并审阅请求。</Text>
      {/连接|凭据|账号|CREDENTIAL|ACCOUNT/.test(recovery.message)?<CreativeAccountPanel provider={recovery.draft.provider_id==='novelai'?'novelai':'autodl'}/>:null}
      {/工作流|WORKFLOW|能力/.test(recovery.message)?<ListAction label="配置生成工作流" secondary onPress={()=>router.push({pathname:'/creative-capabilities',params:{purpose:recovery.draft.provider_id==='novelai'?'image':'video'}})}/>:null}
      <ListAction label="重新核对原草稿" disabled={busy||running} onPress={()=>void grant(recovery.draft)}/>
      <ListAction label="编辑原草稿" secondary onPress={()=>{const draft=recovery.draft;setRecovery(undefined);setOpen(false);router.push({pathname:draft.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:draft.id}});}}/>
      <ListAction label="返回本轮创作" secondary onPress={()=>setRecovery(undefined)}/>
    </ParameterSheet>:null}
    {open&&!request&&!recovery?<ParameterSheet title={runId?'本轮的创作':'本会话的创作'} onClose={()=>setOpen(false)}>
      {!cards.length?<Text style={s.muted}>{readError || (loading?'正在读取创作状态…':'尚未创建生成任务。助手准备好草稿后，可在这里查看草稿、授权和实际成果。')}</Text>:null}
      {[...cards].sort((a,b)=>Number(b.kind==='proposal'&&(b.proposal?.state??b.status??'WAITING')==='WAITING')-Number(a.kind==='proposal'&&(a.proposal?.state??a.status??'WAITING')==='WAITING')).map(card=><View key={card.id} style={s.card}>
        <Text style={s.title}>{card.name}</Text>
        <Text accessibilityLiveRegion="polite" style={s.muted}>{agentCreativeActivityLabel(card)}</Text>
        {card.draft?<>
          <Text style={s.muted}>{draftSpec(card.draft)}</Text>
          <Text style={s.body} numberOfLines={3}>{JSON.parse(card.draft.input_json).prompt || JSON.parse(card.draft.input_json).values?.prompt || '待补充描述'}</Text>
          {card.outputs.length?<ScrollView horizontal contentContainerStyle={{gap:8}}>{card.outputs.map(output=><Pressable key={output.id} accessibilityRole="button" accessibilityLabel={`查看生成成果 ${output.versionNo}`} disabled={output.state!=='AVAILABLE' || !output.relativePath} onPress={()=>{
            if(output.mime?.startsWith('image/'))setPreview(`${FileSystem.documentDirectory}${output.relativePath}`);
            else {setOpen(false);router.push({pathname:'/creative-output/[id]',params:{id:output.id,assetId:output.assetId,jobId:card.jobId??card.draft!.job_id??'',draftId:card.draft!.id}});}
          }}><MediaPreview version={output} kind={card.draft!.provider_id==='novelai'?'image':'video'} label={`生成成果 ${output.versionNo}`} style={{width:180,height:180}} contain/></Pressable>)}</ScrollView>:null}
          <ListAction label={card.draft.state==='EDITING'?'完善这份草稿':card.outputs.some(output=>!card.adoptedVersionIds?.includes(output.id))?'审阅生成候选':card.adoptedVersionIds?.length?'查看当前采用版本':'查看提交记录'} secondary={card.draft.state!=='EDITING'} onPress={()=>{setOpen(false);if(card.adoptedVersionIds?.length&&!card.outputs.some(output=>!card.adoptedVersionIds?.includes(output.id))){router.push({pathname:'/creative-asset/[id]',params:{id:card.outputs[0].assetId,versionId:card.adoptedVersionIds[0],projectId:card.draft!.project_id??undefined}});}else router.push({pathname:card.draft!.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:card.draft!.id}});}}/>
          {card.jobId?<ListAction label={card.status==='UNKNOWN'?'查询原任务':'查看生成任务详情'} secondary onPress={()=>{setOpen(false);router.push({pathname:'/creative-task/[id]',params:{id:card.jobId!}});}}/>:null}
          {card.jobId&&['READY_TO_SUBMIT','SUBMITTING','QUEUED','RUNNING','UNKNOWN'].includes(card.status??'')?<Text style={s.muted}>生成任务独立执行；停止助手不会取消该任务。</Text>:null}
          {card.draft.state==='EDITING'&&hasDraftDescription(card.draft)?<ListAction label="核对这份草稿的生成请求" secondary disabled={busy||running} onPress={()=>void grant(card.draft!)}/>:null}
        </>:<>{card.proposal?<Text style={s.body} numberOfLines={2}>{proposalChanges(card.proposal).map(change=>change.label).join('、')||'内容一致'}{card.proposal.resolved_at?` · ${new Date(card.proposal.resolved_at).toLocaleString()}`:''}</Text>:null}<ListAction label={card.kind==='proposal'?(card.proposal?.state??card.status??'WAITING')==='WAITING'?'审阅修改':(card.proposal?.state??card.status)==='CONFLICT'?'核对版本差异':'查看修改结果':'查看计划步骤'} onPress={()=>{setOpen(false);router.push({pathname:'/creative-project/[id]',params:{id:card.projectId!,tab:card.kind==='proposal'?'activity':'plans',...(card.kind==='proposal'?{proposalId:card.id}:{planId:card.id}),requestId:String(Date.now())}});}}/></>}
      </View>)}
      {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
      {error||readError?<Text accessibilityRole="alert" style={s.error}>{error||readError}</Text>:null}
    </ParameterSheet>:null}
    <ImagePreview uri={preview??null} onClose={()=>setPreview(undefined)}/>
  </View>;
}

function hasDraftDescription(draft:CreativeDraft){
  const input=JSON.parse(draft.input_json);
  return Boolean((input.prompt??input.values?.prompt??'').trim()||input.characters?.some((character:{enabled:boolean;prompt:string})=>character.enabled&&character.prompt.trim()));
}
function draftSpec(draft:CreativeDraft){
  const input=JSON.parse(draft.input_json);
  const state=draft.state==='EDITING'?'尚未提交':'已提交';
  const size=typeof input.width==='number'&&typeof input.height==='number'?`${input.width} × ${input.height}`:input.operation==='upscale'?'放大图片':'查看草稿规格';
  return draft.provider_id==='novelai'?`图片草稿 · ${size} · ${input.samples??1} 张 · ${state}`:`视频草稿 · ${input.resolution??'工作流规格'}${input.duration?` · ${input.duration} 秒`:''} · ${state}`;
}
