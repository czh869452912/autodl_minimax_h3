import {fetchVideoPrice,quoteVideo,quoteLabel} from './autodlPricing';
import {useLiveRefresh} from './useLiveRefresh';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Image,Text,TextInput,View} from 'react-native';
import {useRouter} from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import {getDatabase} from '../storage/databaseClient';
import {creativeFiles,creativeService} from './runtime';
import {creativeAccounts,creativeBudget} from './accountRuntime';
import {executorWakePort} from '../tasks/executorEvents';
import {createId} from '../ids';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
import {planVideoSummary,type CreativePlan,type CreativeDecision,type CreativePlanStep} from './plans';
import type {CreativeShot} from './story';
type Card={plan:CreativePlan;decision:CreativeDecision;step:CreativePlanStep;candidates:Array<{version_id:string;title:string;relative_path:string|null}>};
export function ProjectPlans({projectId,archived=false,compact=false,initialPlanId}:{projectId:string;initialPlanId?:string;archived?:boolean;compact?:boolean}){
  const router=useRouter(),lock=useRef(false);
  const [cards,setCards]=useState<Card[]>([]),[shots,setShots]=useState<CreativeShot[]>([]),[shotId,setShotId]=useState(''),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [choicesLoaded,setChoicesLoaded]=useState(false);
  const [choices,setChoices]=useState<Array<{id:string;title:string}>>([]),[selected,setSelected]=useState<string[]>([]);
  const [choiceNext,setChoiceNext]=useState<{createdAt:number;id:string}>();
  const readEpoch=useRef(0);
  const refresh=useCallback(async(current:()=>boolean=()=>true)=>{
    const epoch=++readEpoch.current;
    const db=getDatabase(),plans=await db.getAllAsync<CreativePlan>('SELECT * FROM creative_plans WHERE project_id=? AND (? IS NULL OR id=?) ORDER BY updated_at DESC LIMIT 30',projectId,initialPlanId??null,initialPlanId??null);
    const rows:Card[]=[];
    for(const plan of plans){
      const decision=await db.getFirstAsync<CreativeDecision>('SELECT * FROM creative_decision_requests WHERE plan_id=?',plan.id);
      const step=await db.getFirstAsync<CreativePlanStep>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'",plan.id);
      if(decision&&step)rows.push({plan,decision,step,candidates:await db.getAllAsync("SELECT c.version_id,a.title,b.relative_path FROM creative_decision_candidates c JOIN creative_asset_versions v ON v.id=c.version_id JOIN creative_assets a ON a.id=v.asset_id LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE c.decision_id=?",decision.id)});
    }
    const shots=await creativeService().shots(projectId);if(epoch===readEpoch.current&&current()){setCards(rows);setShots(shots);}
  },[projectId,initialPlanId]);
  useLiveRefresh(async current=>{try{await refresh(current);}catch{if(current())setError('计划读取失败');}},2000,`${projectId}:${initialPlanId??''}`);
  const work=async(fn:()=>Promise<unknown>)=>{if(lock.current||archived)return;lock.current=true;setBusy(true);setError('');try{await fn();executorWakePort.signal('command');await refresh();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{lock.current=false;setBusy(false);}};
  const action=(label:string,fn:()=>void)=><ListAction label={label} secondary disabled={busy||archived} onPress={fn}/>;
  const authorize=(card:Card)=>void work(async()=>{
    const account=(await creativeAccounts().list()).find(a=>a.provider_id==='autodl');if(!account)throw new Error('请先在创作账号面板连接 AutoDL');
    const binding=JSON.parse(card.step.input_binding_json);
    const price=await fetchVideoPrice().catch(()=>undefined);
    const quote=quoteVideo(price,binding.resolution,binding.duration);
    const estimate=quote?`${quoteLabel(quote)} CNY，查询于 ${new Date(quote.checkedAt).toLocaleTimeString()}。此参考价不是可执行的费用上限；当前服务按未知费用单次授权。`:'无法获取有效估价，费用未知。';
    Alert.alert('授权此计划继续生成',`${planVideoSummary(card.step.input_binding_json)}。固定输入版本 ${card.decision.selected_version_id ?? '尚未选定'}，使用计划提示词，最多生成 1 次视频，15 分钟有效。${estimate}无金额上限。网络结果不明不会自动重发。`,[
      {text:'取消',style:'cancel'},{text:'接受未知费用，仅授权一次',onPress:()=>void work(async()=>{
        const authorizationId=await creativeBudget().grant({provider:'autodl',generationId:account.credential_generation_id,projectId,operations:['video.generate'],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:Date.now()+15*60000});
        await creativeService().execute({name:'plan.resume',payload:{id:card.plan.id,expectedRevision:card.plan.revision,authorizationId}},createId());
      })}]);
  });
  if (compact && !error && !cards.some(c => c.plan.state === 'ACTIVE' && (c.decision.state === 'WAITING' || c.step.state === 'BLOCKED'))) return null;
  return <View style={{gap:12}}>
    <Text style={{color:COLORS.text,fontSize:20,fontWeight:'700'}}>{compact?'需要你处理':'选图与视频计划'}</Text>
    {!compact ? <Text style={{color:COLORS.textMuted}}>计划会保留候选、选定版本与生成状态。视频结果归档为候选，不会覆盖镜头已选成果。</Text> : null}
    {error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}
    {compact&&!cards.some(c=>c.plan.state==='ACTIVE')?<Text style={{color:COLORS.textMuted}}>暂无等待处理的选图计划。</Text>:null}
    {initialPlanId&&!cards.length?<Text style={{color:COLORS.textMuted}}>指定计划已不可用或不属于此项目。</Text>:null}
    {cards.filter(c=>!compact||c.plan.state==='ACTIVE').map(card=><View key={card.plan.id} style={{borderWidth:1,borderColor:COLORS.border,borderRadius:12,padding:12,gap:8}}>
      <Text style={{color:COLORS.text,fontWeight:'700'}}>{initialPlanId?'当前计划 · ':''}{card.plan.title}</Text>
      <Text style={{color:COLORS.textMuted}}>{({ACTIVE:'进行中',COMPLETED:'已归档视频候选',CANCELLED:'已取消',QUARANTINED:'备份恢复后已隔离，不会自动生成'} as Record<string,string>)[card.plan.state]} · {({PENDING:'等待选图',READY:'等待提交',BLOCKED:'待处理',DISPATCHED:'已提交任务',SUCCEEDED:'完成',FAILED:'任务未完成',CANCELLED:'已取消'} as Record<string,string>)[card.step.state]}</Text>
      <Text style={{color:COLORS.textMuted}}>{planVideoSummary(card.step.input_binding_json)}{'\n'}视频提示词：{JSON.parse(card.step.input_binding_json).prompt}</Text>
      {card.step.error_json?<Text style={{color:COLORS.textMuted}}>{JSON.parse(card.step.error_json).message}</Text>:null}
      {card.plan.state==='ACTIVE'&&card.decision.state==='WAITING'?card.candidates.map(c=><View key={c.version_id} style={{gap:6}}>
        {c.relative_path?<Image accessibilityLabel={c.title} source={{uri:`${FileSystem.documentDirectory}${c.relative_path}`}} style={{height:160,width:'100%'}} resizeMode="contain"/>:null}
        {action(`选定 ${c.title} 并继续`,()=>Alert.alert('选定并继续',`${planVideoSummary(card.step.input_binding_json)}。${card.plan.authorization_id?'将固定此版本为镜头图片，并在有效授权范围内提交 H3。':'将固定此版本为镜头图片。后续需授权一次 H3 生成才能继续。'}`,[{text:'取消',style:'cancel'},{text:'选定',onPress:()=>void work(async()=>{
          await creativeFiles().verify(c.version_id);
          await creativeService().execute({name:'plan.resolveSelection',payload:{decisionId:card.decision.id,versionId:c.version_id,expectedRevision:card.decision.revision}},`selection:${card.decision.id}:${c.version_id}`);
        })}]))}
      </View>):null}
      {card.plan.state==='ACTIVE'&&card.step.state==='BLOCKED'&&!card.step.job_id?action('授权并继续生成',()=>authorize(card)):null}
      {card.step.job_id?<ListAction label="查看生成任务" secondary onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:card.step.job_id!,projectId,planId:card.plan.id,stepId:card.step.id}})}/>:null}
      {card.plan.state==='ACTIVE'&&card.step.state!=='DISPATCHED'?action('取消计划',()=>void work(()=>creativeService().execute({name:'plan.cancel',payload:{id:card.plan.id,expectedRevision:card.plan.revision}},createId()))):null}
      {card.plan.state==='QUARANTINED'?<Text style={{color:COLORS.textMuted}}>请先核对旧任务结果。确需再次生成时新建计划并重新授权，可能重复消费。</Text>:null}
    </View>)}
    {!archived&&!compact&&!shots.length?<View style={{gap:8}}><Text style={{color:COLORS.text}}>先添加镜头，再选择参考图片并编排视频。</Text><ListAction label="去添加镜头" onPress={()=>router.replace({pathname:'/creative-project/[id]',params:{id:projectId,tab:'shots',requestId:createId()}})}/></View>:null}
    {!archived&&!compact&&shots.length>0?<View style={{gap:8}}>
      <Text style={{color:COLORS.text,fontWeight:'700'}}>新建选图计划</Text>
      {shots.map(s=><View key={s.id}>{action(`${shotId===s.id?'✓ ':''}${s.title}`,()=>{setShotId(s.id);setPrompt(s.description);setChoices([]);setSelected([]);setChoiceNext(undefined);setChoicesLoaded(false);})}</View>)}
      {selected.length>0?<TextInput accessibilityLabel="计划视频提示词" placeholder="动作、运镜和节奏" multiline value={prompt} onChangeText={setPrompt} style={{color:COLORS.text,borderWidth:1,borderColor:COLORS.border,padding:12,minHeight:90}}/>:null}
      {shotId?action('读取项目图片候选',()=>void work(async()=>{const page=await creativeService().availableVersionPage({kind:'image',projectId});setChoices(page.items.map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`})));setChoiceNext(page.next);setSelected([]);setChoicesLoaded(true); })):null}
      {!shotId?<Text style={{color:COLORS.textMuted}}>先选择要制作的镜头。</Text>:null}
      {shotId&&choicesLoaded&&!choices.length?<View style={{gap:8}}><Text style={{color:COLORS.textMuted}}>项目还没有可用图片。先为这个镜头导入图片或制作参考图，再回来编排视频。</Text><ListAction label="为此镜头准备参考图" onPress={()=>router.replace({pathname:'/creative-project/[id]',params:{id:projectId,tab:'shots',shotId,requestId:createId()}})}/></View>:null}
      {choices.map(c=><View key={c.id}>{action(`${selected.includes(c.id)?'✓ ':''}${c.title}`,()=>setSelected(previous=>previous.includes(c.id)?previous.filter(v=>v!==c.id):previous.length<20?[...previous,c.id]:previous))}</View>)}
      {choiceNext?action('加载更多图片候选',()=>void work(async()=>{const page=await creativeService().availableVersionPage({kind:'image',projectId,after:choiceNext});setChoices(old=>[...old,...page.items.filter(item=>!old.some(c=>c.id===item.version.id)).map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`}))]);setChoiceNext(page.next);})):null}
      {selected.length>0?action('保存计划（不消费）',()=>void work(async()=>{const shot=shots.find(s=>s.id===shotId);if(!shot)throw new Error('请先选择镜头');for(const id of selected)await creativeFiles().verify(id);await creativeService().execute({name:'plan.createSelection',payload:{projectId,shotId,expectedShotRevision:shot.revision,title:`${shot.title} · 选图生成视频`,candidateVersionIds:selected,videoPrompt:prompt}},createId());setSelected([]);setChoices([]);setChoicesLoaded(false); })):null}
    </View>:null}
  </View>;
}
