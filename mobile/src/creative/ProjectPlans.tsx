import {ParameterSheet} from './WorkbenchUI';
import {CreativeAccountPanel} from './CreativeAccountPanel';
import {readPlanDependencies} from './planDependencies';
import {grantOutboundConsent} from './outboundConsent';
import {PlanRequestReview} from './PlanRequestReview';
import {readBatchReviewTargets,type PlanReviewTarget} from './planReviewTargets';
import {creativeRequestHash} from './videoSubmission';
import {readPlanPage,readPlanBatchPage,readDependencyPlanPage,type PlanCursor,type PlanFilter,type PlanBatchSummary} from './planReads';
import {planPresentation} from './planPresentation';
import {prepareCreativeVideo} from './videoRuntime';
import {authorizePlanBatch,authorizePlanRequest,type PlanApproval} from './planAuthorization';
import {preparedCreativeSubmission} from './preparedSubmission';
import {useLiveRefresh} from './useLiveRefresh';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Image,Pressable,Text,TextInput,View} from 'react-native';
import {useRouter} from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import {getDatabase} from '../storage/databaseClient';
import {creativeFiles,creativeService} from './runtime';

import {executorWakePort} from '../tasks/executorEvents';
import {createId} from '../ids';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
import {planVideoSummary,type CreativePlan,type CreativeDecision,type CreativePlanStep} from './plans';
import type {CreativeShot} from './story';
type Card={localCheck?:{state:string;result_binding_json:string;error_json:string|null};dependencies:Awaited<ReturnType<typeof readPlanDependencies>>;paused:boolean;plan:CreativePlan;decision:CreativeDecision;step:CreativePlanStep;candidates:Array<{version_id:string;title:string;relative_path:string|null}>};
export function ProjectPlans({projectId,archived=false,compact=false,initialPlanId}:{projectId:string;initialPlanId?:string;archived?:boolean;compact?:boolean}){
  const router=useRouter(),lock=useRef(false);
  const [cards,setCards]=useState<Card[]>([]),[shots,setShots]=useState<CreativeShot[]>([]),[shotId,setShotId]=useState(''),[prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [choicesLoaded,setChoicesLoaded]=useState(false);
  const [choices,setChoices]=useState<Array<{id:string;title:string}>>([]),[selected,setSelected]=useState<string[]>([]);
  const [choiceNext,setChoiceNext]=useState<{createdAt:number;id:string}>();
  const [batchSelection,setBatchSelection]=useState<string[]|null>(null),[batchId,setBatchId]=useState<string>();
  const [rangeOpen,setRangeOpen]=useState(false),[rangeTitle,setRangeTitle]=useState('全部计划'),[rangeDraft,setRangeDraft]=useState<{id?:string;title:string}>({title:'全部计划'});
  const [filter,setFilter]=useState<PlanFilter>('all'),[pageHistory,setPageHistory]=useState<Array<PlanCursor|undefined>>([]),[pageNext,setPageNext]=useState<PlanCursor>();
  const [batches,setBatches]=useState<PlanBatchSummary[]>([]),[batchCursor,setBatchCursor]=useState<PlanCursor>(),[batchNext,setBatchNext]=useState<PlanCursor>();
  const [dependencyTarget,setDependencyTarget]=useState<string>(),[dependencyQuery,setDependencyQuery]=useState(''),[dependencyRows,setDependencyRows]=useState<CreativePlan[]>([]),[dependencyAfter,setDependencyAfter]=useState<PlanCursor>(),[dependencyNext,setDependencyNext]=useState<PlanCursor>();
  const [detailId,setDetailId]=useState(initialPlanId),[checksOpen,setChecksOpen]=useState(false),[creation,setCreation]=useState<'choose'|'single'|'batch'>(),[candidate,setCandidate]=useState<{planId:string;versionId:string}>();
  useEffect(()=>{setCards([]);setShots([]);setError('');setDetailId(initialPlanId);setChecksOpen(false);setCandidate(undefined);setCreation(undefined);setBatchId(undefined);setRangeTitle('全部计划');setRangeOpen(false);setFilter('all');setPageHistory([]);setPageNext(undefined);setBatchCursor(undefined);setBatches([]);setBatchNext(undefined);setBatchSelection(null);setShotId('');setPrompt('');setChoices([]);setChoiceNext(undefined);setSelected([]);setChoicesLoaded(false);setDependencyTarget(undefined);},[projectId,initialPlanId]);
  useEffect(()=>{let live=true;setDependencyRows([]);setDependencyNext(undefined);if(dependencyTarget)void readDependencyPlanPage(getDatabase(),projectId,dependencyTarget,dependencyQuery,dependencyAfter).then(page=>{if(live){setDependencyRows(page.items);setDependencyNext(page.next);}}).catch(()=>{if(live)setError('前置计划读取失败，请重新搜索');});return()=>{live=false;};},[projectId,dependencyTarget,dependencyQuery,dependencyAfter]);

  const owner=useRef(''),context=`${projectId}:${initialPlanId??''}:${batchId??''}`;owner.current=context;
  type Review={db:ReturnType<typeof getDatabase>;context:string;batchId?:string;approvals:PlanApproval[];items:Array<{title:string;note?:string;preview:Awaited<ReturnType<typeof prepareCreativeVideo>>}>;excluded:Array<{title:string;reason:string}>};
  const [review,setReview]=useState<Review>();
  const [recovery,setRecovery]=useState<{targets:PlanReviewTarget[];excluded:Review['excluded'];batchId?:string;message:string}>();
  useEffect(()=>{owner.current=context;setReview(undefined);setRecovery(undefined);return()=>{owner.current='';};},[context]);
  const pageCursor=pageHistory[pageHistory.length-1];
  const readEpoch=useRef(0);
  const refresh=useCallback(async(current:()=>boolean=()=>true)=>{
    const epoch=++readEpoch.current;
    const db=getDatabase();
    const [page,batchPage]=await Promise.all([readPlanPage(db,projectId,{planId:initialPlanId,batchId,filter,after:pageCursor}),readPlanBatchPage(db,projectId,batchCursor)]);
    const plans=page.items;
    const rows:Card[]=[];
    for(const plan of plans){
      const decision=await db.getFirstAsync<CreativeDecision>('SELECT * FROM creative_decision_requests WHERE plan_id=?',plan.id);
      const step=await db.getFirstAsync<CreativePlanStep>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video'",plan.id);
      if(decision&&step)rows.push({localCheck:await db.getFirstAsync<{state:string;result_binding_json:string;error_json:string|null}>("SELECT state,result_binding_json,error_json FROM creative_plan_steps WHERE plan_id=? AND kind='local_check'",plan.id)??undefined,dependencies:await readPlanDependencies(db,step.id),paused:!!await db.getFirstAsync('SELECT plan_id FROM creative_plan_controls WHERE plan_id=? AND paused=1',plan.id),plan,decision,step,candidates:await db.getAllAsync("SELECT c.version_id,a.title,b.relative_path FROM creative_decision_candidates c JOIN creative_asset_versions v ON v.id=c.version_id JOIN creative_assets a ON a.id=v.asset_id LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE c.decision_id=?",decision.id)});
    }
    const shots=await creativeService().shots(projectId);if(epoch===readEpoch.current&&current()){setCards(rows);setShots(shots);setPageNext(page.next);setBatches(batchPage.items);setBatchNext(batchPage.next);}
  },[projectId,initialPlanId,batchId,filter,pageCursor,batchCursor]);
  useLiveRefresh(async current=>{try{await refresh(current);}catch{if(current())setError('计划读取失败');}},2000,`${projectId}:${initialPlanId??''}:${batchId??''}:${filter}:${pageCursor?.id??''}:${batchCursor?.id??''}`);
  const work=async(fn:(current:()=>boolean)=>Promise<unknown>)=>{if(lock.current||archived)return;const origin=context,db=getDatabase(),current=()=>owner.current===origin&&getDatabase()===db;lock.current=true;setBusy(true);setError('');try{await fn(current);executorWakePort.signal('command');if(current())await refresh(current);}catch(e){if(current())setError(e instanceof Error?e.message:'操作失败');}finally{lock.current=false;if(owner.current)setBusy(false);}};
  const action=(label:string,fn:()=>void)=><ListAction label={label} secondary disabled={busy||archived} onPress={fn}/>;
  const prepareReview=async(targets:PlanReviewTarget[],excluded:Array<{title:string;reason:string}>,selectedBatch?:string)=>{
    if(!targets.length)throw Error('没有已选图且等待授权的镜头；暂停、未选图与已有任务均未纳入。');
    const db=getDatabase(),origin=context,approvals:PlanApproval[]=[],items:Review['items']=[];
    for(const card of targets){
      if(!card.step.draft_id)throw Error('计划草稿不可用');
      let preview:Awaited<ReturnType<typeof prepareCreativeVideo>>;
      try{preview=await prepareCreativeVideo(card.step.draft_id);}catch(e){if(owner.current===origin&&getDatabase()===db)setRecovery({targets,excluded,batchId:selectedBatch,message:e instanceof Error?e.message:'请求准备失败'});return;}
      if(db!==getDatabase()||preview.db!==db||owner.current!==origin)throw Error('计划范围或数据库已变化，请重新准备');
      approvals.push({planId:card.plan.id,planRevision:card.plan.revision,stepId:card.step.id,stepRevision:card.step.revision,projectId,generationId:preview.account.credential_generation_id,submission:preparedCreativeSubmission(preview)});
      const dependencies=await readPlanDependencies(db,card.step.id);
      items.push({title:card.plan.title,preview,note:dependencies.length?'前置计划：'+dependencies.map(dep=>`${dep.title} · ${dep.state==='SUCCEEDED'?'已完成':'尚未完成，授权后仍需等待'}`).join('；'):'无前置计划；提交前仍会核对镜头与素材版本。'});
    }
    if(db!==getDatabase()||owner.current!==origin)throw Error('计划范围或数据库已变化，请重新准备');
    setRecovery(undefined);setReview({db,context:origin,batchId:selectedBatch,approvals,items,excluded});
  };
  const authorize=(card:Card)=>void work(async()=>{
    if(card.paused)throw Error('请先恢复此计划的后续提交，再重新审阅');
    await prepareReview([card],[]);
  });
  const authorizeBatch=()=>void work(async()=>{
    if(!batchId)throw Error('请先选择批次');
    const targets=await readBatchReviewTargets(getDatabase(),projectId,batchId);
    await prepareReview(targets.included,targets.excluded,batchId);
  });
  const confirmReview=async()=>{
    if(!review)return;
    const selected=review;setReview(undefined);
    await work(async()=>{
      if(selected.db!==getDatabase()||owner.current!==selected.context)throw Error('计划范围或数据库已变化，请重新审阅');
      for(const approval of selected.approvals){
        if(await selected.db.getFirstAsync('SELECT plan_id FROM creative_plan_controls WHERE plan_id=? AND paused=1',approval.planId))throw Error('计划已暂停，请重新审阅本次集合');
      }
      for(const approval of selected.approvals)await grantOutboundConsent(selected.db,{projectId,provider:'autodl',generationId:approval.generationId,requestHash:creativeRequestHash(approval.submission.prepared),versions:approval.submission.versionIds});
      if(selected.batchId)await authorizePlanBatch(selected.db,selected.batchId,projectId,selected.approvals);
      else await authorizePlanRequest(selected.db,selected.approvals[0]);
    });
  };
  const confirmCandidate=(card:Card,c:Card['candidates'][number])=>Alert.alert('核对参考图',`${c.title} · 固定版本 ${c.version_id}\n${planVideoSummary(card.step.input_binding_json)}。${card.plan.authorization_id?'将固定此版本为镜头图片，并在有效授权范围内提交 H3。':'将固定此版本为镜头图片。后续需授权一次 H3 生成才能继续。'}`,[{text:'取消',style:'cancel'},{text:'选定',onPress:()=>void work(async()=>{
          await creativeFiles().verify(c.version_id);
          await creativeService().execute({name:'plan.resolveSelection',payload:{decisionId:card.decision.id,versionId:c.version_id,expectedRevision:card.decision.revision}},`selection:${card.decision.id}:${c.version_id}`);
        })}]);
  const closeCreation=()=>{if(busy)return;const leave=()=>setCreation(undefined);if(shotId||selected.length||batchSelection?.length)Alert.alert('保留准备内容？','返回列表会保留本次未保存的准备内容，再次新建可继续。',[{text:'继续准备',style:'cancel'},{text:'返回列表',onPress:leave}]);else leave();};
  const renderDetails=(card:Card)=><View style={{gap:12}}>{error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}<Text style={{color:COLORS.text,fontWeight:'700'}}>{card.plan.title}</Text><Text style={{color:COLORS.textMuted}}>准备参考 → 核对输入 → 检查与依赖 → 许可 → 执行 → 审阅候选</Text>
      <Text style={{color:COLORS.textMuted}}>{planVideoSummary(card.step.input_binding_json)}{'\n'}视频提示词：{JSON.parse(card.step.input_binding_json).prompt}</Text>
      {action(checksOpen?'收起检查与依赖':'检查与依赖',()=>setChecksOpen(!checksOpen))}
      {checksOpen?<View style={{gap:8}}>      {card.localCheck?<Text style={{color:COLORS.textMuted}}>本地依赖检查：{card.localCheck.state}{card.localCheck.error_json?' · '+JSON.parse(card.localCheck.error_json).message:''}</Text>:card.plan.state==='ACTIVE'&&!card.step.job_id?action('增加生成前本地检查',()=>void work(()=>creativeService().execute({name:'plan.addLocalCheck',payload:{id:card.plan.id,expectedRevision:card.plan.revision}},createId()))):null}
      {card.dependencies?.map(dep=><View key={dep.id}><Text style={{color:COLORS.textMuted}}>前置完成：{dep.title} · {dep.plan_state} / {dep.state}</Text>{!card.step.job_id&&card.plan.state==='ACTIVE'?action('移除前置 '+dep.title,()=>void work(()=>creativeService().execute({name:'plan.setDependency',payload:{id:card.plan.id,expectedRevision:card.plan.revision,upstreamPlanId:dep.id,enabled:false}},createId()))):null}</View>)}
      {!compact&&!card.step.job_id&&card.plan.state==='ACTIVE'?action(dependencyTarget===card.plan.id?'收起前置选择':'设置前置计划',()=>{setDependencyTarget(dependencyTarget===card.plan.id?undefined:card.plan.id);setDependencyQuery('');setDependencyAfter(undefined);}):null}
      {dependencyTarget===card.plan.id?<View style={{gap:8}}><Text style={{color:COLORS.textMuted}}>搜索此项目的前置计划，不受当前批次或分页限制。前置完成不会自动采用其输出。</Text><TextInput accessibilityLabel="搜索前置计划" placeholder="名称或标识" value={dependencyQuery} onChangeText={value=>{setDependencyQuery(value);setDependencyAfter(undefined);}} style={{color:COLORS.text,borderWidth:1,borderColor:COLORS.border,padding:12}}/>{dependencyRows.filter(c=>!card.dependencies.some(d=>d.id===c.id)).map(c=><View key={c.id}>{action('等待 '+c.title,()=>void work(async current=>{await creativeService().execute({name:'plan.setDependency',payload:{id:card.plan.id,expectedRevision:card.plan.revision,upstreamPlanId:c.id,enabled:true}},createId());if(!current())return;setDependencyTarget(undefined);}))}</View>)}{!dependencyRows.length?<Text style={{color:COLORS.textMuted}}>没有匹配的前置计划</Text>:null}{dependencyNext?action('更早的前置计划',()=>setDependencyAfter(dependencyNext)):null}{dependencyAfter?action('最新前置计划',()=>setDependencyAfter(undefined)):null}</View>:null}
</View>:null}
      {card.step.error_json?<Text style={{color:COLORS.textMuted}}>{JSON.parse(card.step.error_json).message}</Text>:null}
      {card.plan.state==='ACTIVE'&&card.decision.state==='WAITING'?card.candidates.map(c=><View key={c.version_id} style={{gap:6}}>
        {c.relative_path?<Image accessibilityLabel={c.title} source={{uri:`${FileSystem.documentDirectory}${c.relative_path}`}} style={{height:160,width:'100%'}} resizeMode="contain"/>:null}
        {action(`${candidate?.planId===card.plan.id&&candidate.versionId===c.version_id?'已选 · ':'选择 · '}${c.title} · ${c.version_id.slice(-8)}`,()=>setCandidate({planId:card.plan.id,versionId:c.version_id}))}
      </View>):null}
      {card.plan.state==='ACTIVE'&&candidate?.planId===card.plan.id&&card.decision.state==='WAITING'?action(card.plan.authorization_id?'确认参考图并按已有授权继续':'确认选图，之后再核对生成许可',()=>{const c=card.candidates.find(row=>row.version_id===candidate.versionId);if(c)confirmCandidate(card,c);}):null}
      {card.plan.state==='ACTIVE'&&card.step.state==='FAILED'?action('重做失败镜头',()=>Alert.alert('准备重做此镜头','保留原任务和费用记录，创建新的草稿；不会自动生成，随后需重新授权。',[{text:'取消',style:'cancel'},{text:'准备重做',onPress:()=>void work(async()=>{const shot=shots.find(s=>s.id===card.plan.shot_id);if(!shot)throw new Error('镜头不可用');await creativeService().execute({name:'plan.retryFailed',payload:{id:card.plan.id,expectedRevision:card.plan.revision,expectedShotRevision:shot.revision}},createId());})}])):null}
      {card.plan.state==='ACTIVE'?action(card.paused?'继续后续计划':'暂停后续计划',()=>void work(()=>creativeService().execute({name:'plan.setPaused',payload:{id:card.plan.id,expectedRevision:card.plan.revision,paused:!card.paused}},createId()))):null}
      {card.paused?<Text style={{color:COLORS.textMuted}}>后续提交已暂停；已发送的生成仍由任务中心核查和归档。</Text>:null}
      {card.plan.state==='ACTIVE'&&card.step.state==='BLOCKED'&&!card.step.job_id&&!card.paused?<>{<ListAction label="核对生成请求与许可" disabled={busy||archived} onPress={()=>authorize(card)}/>}{action('按当前镜头重新准备',()=>{const shot=shots.find(s=>s.id===card.plan.shot_id);if(!shot?.selected_image){setError('请先为镜头选定图片');return;}const nextPrompt=shot.description.trim()||JSON.parse(card.step.input_binding_json).prompt;Alert.alert('重新准备此镜头',`输入图片：${shot.selected_image}\n提示词：${nextPrompt}\n${planVideoSummary(card.step.input_binding_json)}。保留原草稿和历史任务，后续需重新授权。`,[{text:'取消',style:'cancel'},{text:'确认输入',onPress:()=>void work(()=>creativeService().execute({name:'plan.reprepare',payload:{id:card.plan.id,expectedRevision:card.plan.revision,expectedShotRevision:shot.revision,prompt:nextPrompt}},createId()))}]);})}</>:null}
      {card.step.job_id?<ListAction label="查看生成任务" secondary onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:card.step.job_id!,projectId,planId:card.plan.id,stepId:card.step.id}})}/>:null}
      {card.plan.state==='ACTIVE'&&card.step.state!=='DISPATCHED'?action('取消计划',()=>Alert.alert('取消此计划？','保留原草稿、任务与费用记录。取消不撤回服务端已提交的任务，也不会退款。',[{text:'继续保留',style:'cancel'},{text:'取消此计划',style:'destructive',onPress:()=>void work(()=>creativeService().execute({name:'plan.cancel',payload:{id:card.plan.id,expectedRevision:card.plan.revision}},createId()))}])):null}
      {card.plan.state==='QUARANTINED'?<Text style={{color:COLORS.textMuted}}>请先核对旧任务结果。确需再次生成时新建计划并重新授权，可能重复消费。</Text>:null}
</View>;
  const detailCard=cards.find(c=>c.plan.id===detailId);
  const creationBody=<>{error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}{creation==='choose'?<><Text style={{color:COLORS.textMuted}}>只建立计划，不会生成。选择范围后准备参考图和提示词。</Text>{action('单个镜头',()=>setCreation('single'))}{action('多个镜头',()=>{setBatchSelection(old=>old??[]);setCreation('batch');})}</>:null}{creation==='single'?<>{!archived&&!compact&&shots.length>0?<View style={{gap:8}}>
      <Text style={{color:COLORS.text,fontWeight:'700'}}>新建选图计划</Text>
      {shots.map(s=><View key={s.id}>{action(`${shotId===s.id?'✓ ':''}${s.title}`,()=>void work(async current=>{setShotId(s.id);setPrompt(s.description);setChoices([]);setSelected([]);setChoiceNext(undefined);setChoicesLoaded(false);const page=await creativeService().availableVersionPage({kind:'image',projectId});if(!current())return;setChoices(page.items.map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`})));setChoiceNext(page.next);setChoicesLoaded(true);}))}</View>)}
      {selected.length>0?<TextInput accessibilityLabel="计划视频提示词" placeholder="动作、运镜和节奏" multiline value={prompt} onChangeText={setPrompt} style={{color:COLORS.text,borderWidth:1,borderColor:COLORS.border,padding:12,minHeight:90}}/>:null}
      {shotId?action('重新读取图片候选',()=>void work(async current=>{const page=await creativeService().availableVersionPage({kind:'image',projectId});if(!current())return;setChoices(page.items.map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`})));setChoiceNext(page.next);setSelected([]);setChoicesLoaded(true); })):null}
      {!shotId?<Text style={{color:COLORS.textMuted}}>先选择要制作的镜头。</Text>:null}
      {shotId&&choicesLoaded&&!choices.length?<View style={{gap:8}}><Text style={{color:COLORS.textMuted}}>项目还没有可用图片。先为这个镜头导入图片或制作参考图，再回来编排视频。</Text><ListAction label="为此镜头准备参考图" onPress={()=>router.replace({pathname:'/creative-project/[id]',params:{id:projectId,tab:'shots',shotId,requestId:createId()}})}/></View>:null}
      {choices.map(c=><View key={c.id}>{action(`${selected.includes(c.id)?'✓ ':''}${c.title}`,()=>setSelected(previous=>previous.includes(c.id)?previous.filter(v=>v!==c.id):previous.length<20?[...previous,c.id]:previous))}</View>)}
      {choiceNext?action('加载更多图片候选',()=>void work(async current=>{const page=await creativeService().availableVersionPage({kind:'image',projectId,after:choiceNext});if(!current())return;setChoices(old=>[...old,...page.items.filter(item=>!old.some(c=>c.id===item.version.id)).map(item=>({id:item.version.id,title:`${item.title} · 版本 ${item.version.versionNo}`}))]);setChoiceNext(page.next);})):null}
      {selected.length>0?action('保存计划（不消费）',()=>void work(async current=>{const shot=shots.find(s=>s.id===shotId);if(!shot)throw new Error('请先选择镜头');for(const id of selected)await creativeFiles().verify(id);await creativeService().execute({name:'plan.createSelection',payload:{projectId,shotId,expectedShotRevision:shot.revision,title:`${shot.title} · 选图生成视频`,candidateVersionIds:selected,videoPrompt:prompt}},createId());if(!current())return;setSelected([]);setChoices([]);setChoicesLoaded(false);setShotId('');setPrompt('');setCreation(undefined); })):null}
    </View>:null}</>:null}{creation==='batch'?<>{batchSelection?<View style={{gap:8}}><Text style={{color:COLORS.text}}>选择镜头 · {batchSelection.length}/20，仅建立计划，不会生成</Text>
      {shots.map(shot=>{const ready=!!shot.selected_image&&!!shot.description.trim(),chosen=batchSelection.includes(shot.id);return <Pressable key={shot.id} accessibilityRole="checkbox" accessibilityLabel={shot.title} accessibilityState={{checked:chosen,disabled:!ready||busy}} disabled={!ready||busy} onPress={()=>setBatchSelection(ids=>ids?.includes(shot.id)?ids.filter(id=>id!==shot.id):(ids?.length??0)<20?[...(ids??[]),shot.id]:ids)} style={{minHeight:48,padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:12,gap:6}}><Text style={{color:COLORS.text}}>{chosen?'已选 · ':''}{shot.title}</Text><Text style={{color:COLORS.textMuted}}>{!shot.selected_image?'需先选定参考图':!shot.description.trim()?'需填写动作描述':'参考图已选定 · 描述已就绪'}</Text></Pressable>;})}
      {!shots.some(s=>s.selected_image&&s.description.trim())?<Text style={{color:COLORS.textMuted}}>请先为镜头选定图片并填写动作描述。</Text>:null}
      {batchSelection.length?action('确认所选镜头并建立批次',()=>{const ready=shots.filter(s=>batchSelection.includes(s.id));Alert.alert('准备多镜头计划',ready.map(s=>s.title).join('、')+'。逐镜头审阅并授权后才会生成。',[{text:'取消',style:'cancel'},{text:'建立计划',onPress:()=>void work(async current=>{await creativeService().execute({name:'plan.createBatch',payload:{projectId,title:'多镜头制作',shots:ready.map(s=>({shotId:s.id,expectedShotRevision:s.revision,title:s.title,candidateVersionIds:[s.selected_image!],videoPrompt:s.description}))}},createId());if(!current())return;setBatchSelection(null);setCreation(undefined);setBatchId(undefined);setRangeTitle('全部计划');setPageHistory([]);setBatchCursor(undefined);})}]);}):null}
      {action('取消选择镜头',()=>{setBatchSelection(null);setCreation('choose');})}</View>:null}</>:null}</>;
  if (compact && !recovery && !review && !error && !cards.some(c => c.plan.state === 'ACTIVE' && (c.decision.state === 'WAITING' || c.step.state === 'BLOCKED'))) return null;
  return <View style={{gap:12}}>
    {rangeOpen?<ParameterSheet title="选择计划范围" fullScreen onClose={()=>setRangeOpen(false)}>
      <Text style={{color:COLORS.textMuted}}>选择仅预览范围，确认后才切换。批次摘要来自完整批次，列表每页最多 30 项。</Text>
      {action((!rangeDraft.id?'已选 · ':'')+'全部计划',()=>setRangeDraft({title:'全部计划'}))}
      {batches.map(batch=><View key={batch.id}>{action((rangeDraft.id===batch.id?'已选 · ':'')+batch.title,()=>setRangeDraft({id:batch.id,title:batch.title}))}<Text style={{color:COLORS.textMuted}}>{batch.total} 个镜头 · {batch.completed} 已完成 · {batch.active} 未完成 · {batch.failed} 失败 · {batch.blocked} 待处理</Text></View>)}
      {batchNext?action('更早的批次',()=>setBatchCursor(batchNext)):null}
      {batchCursor?action('最新批次',()=>setBatchCursor(undefined)):null}
      <ListAction label="确认此范围" onPress={()=>{setBatchId(rangeDraft.id);setRangeTitle(rangeDraft.title);setPageHistory([]);setDetailId(undefined);setRangeOpen(false);}}/>
      {action('取消，保留原范围',()=>setRangeOpen(false))}
    </ParameterSheet>:null}
    {creation?<ParameterSheet title={creation==='choose'?'新建计划':creation==='single'?'准备单镜头计划':'准备多镜头批次'} fullScreen onClose={closeCreation}>{creationBody}{creation!=='choose'?action('返回范围选择',()=>setCreation('choose')):null}</ParameterSheet>:null}
    {detailCard&&!review&&!recovery?<ParameterSheet title="计划详情" fullScreen onClose={()=>{if(!busy)setDetailId(undefined);}}>{renderDetails(detailCard)}</ParameterSheet>:null}
    {recovery?<ParameterSheet title="计划请求尚未就绪" fullScreen onClose={()=>{if(!busy)setRecovery(undefined);}}>
      <Text accessibilityRole="alert" style={{color:COLORS.danger}}>{recovery.message}</Text>
      <Text style={{color:COLORS.textMuted}}>保留原计划。配置保存不会提交；返回后需重新核对请求，旧版本变化会阻止授权。</Text>
      {/连接|凭据|账号|CREDENTIAL|ACCOUNT/.test(recovery.message)?<CreativeAccountPanel provider="autodl"/>:null}
      {/工作流|WORKFLOW/.test(recovery.message)?action('配置生成工作流',()=>router.push({pathname:'/creative-capabilities',params:{purpose:'video'}})):null}
      {action('重新核对计划请求',()=>void work(()=>prepareReview(recovery.targets,recovery.excluded,recovery.batchId)))}
      {recovery.targets.map(t=><View key={t.plan.id}>{t.step.draft_id?action('编辑 '+t.plan.title+' 的原草稿',()=>router.push({pathname:'/creative-draft/[id]',params:{id:t.step.draft_id!}})):null}</View>)}
      {action('返回计划',()=>setRecovery(undefined))}
    </ParameterSheet>:null}
    {review?<PlanRequestReview items={review.items} excluded={review.excluded} batch={!!review.batchId} busy={busy} error={error} onClose={()=>{if(!busy)setReview(undefined);}} onConfirm={confirmReview}/>:null}
    <Text style={{color:COLORS.text,fontSize:20,fontWeight:'700'}}>{compact?'需要你处理':'选图与视频计划'}</Text>
    {!compact ? <Text style={{color:COLORS.textMuted}}>计划会保留候选、选定版本与生成状态。视频结果归档为候选，不会覆盖镜头已选成果。</Text> : null}
    {!compact&&!initialPlanId?<View style={{gap:8}}>
      {action('范围：'+rangeTitle,()=>{setRangeDraft({id:batchId,title:rangeTitle});setRangeOpen(true);})}
      {batchId&&!archived?<ListAction label="核对批次待授权请求" disabled={busy} onPress={authorizeBatch}/>:null}
      <View style={{flexDirection:'row',gap:8}}>{(['all','unfinished','failed'] as const).map(value=><View key={value}>{action(({all:'全部',unfinished:'仅未完成',failed:'仅失败'})[value]+(filter===value?' ✓':''),()=>{setFilter(value);setPageHistory([]);})}</View>)}</View>
    </View>:null}
    {!compact&&!archived? action('新建计划',()=>setCreation('choose')):null}
    {error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}
    {compact&&!cards.some(c=>c.plan.state==='ACTIVE')?<Text style={{color:COLORS.textMuted}}>暂无等待处理的选图计划。</Text>:null}
    {initialPlanId&&!cards.length?<Text style={{color:COLORS.textMuted}}>指定计划已不可用或不属于此项目。</Text>:null}
    <Text style={{color:COLORS.textMuted}}>当前页 {cards.length} 个计划 · {filter==='all'?'全部状态':filter==='failed'?'仅失败':'仅未完成'}；批次授权按完整批次另行核对。</Text>
    {cards.filter(c=>!compact||c.plan.state==='ACTIVE').map(card=>{const presentation=planPresentation(card);return <View key={card.plan.id} style={{borderWidth:1,borderColor:COLORS.border,borderRadius:12,padding:12,gap:8}}>
      <Text style={{color:COLORS.text,fontWeight:'700'}}>{card.plan.title}</Text>
      <Text accessibilityLiveRegion="polite" style={{color:COLORS.textMuted}}>{presentation.status} · {card.dependencies.length} 项前置</Text>
      {card.step.error_json?<Text style={{color:COLORS.textMuted}}>{JSON.parse(card.step.error_json).message}</Text>:null}
      {action(presentation.action,()=>{setDetailId(card.plan.id);setChecksOpen(false);setCandidate(undefined);})}
    </View>;})}
    {!compact&&pageNext?action('更早的计划',()=>setPageHistory(old=>[...old,pageNext])):null}
    {!compact&&pageHistory.length?action('上一页计划',()=>setPageHistory(old=>old.slice(0,-1))):null}
    {!archived&&!compact&&!shots.length?<View style={{gap:8}}><Text style={{color:COLORS.text}}>先添加镜头，再选择参考图片并编排视频。</Text><ListAction label="去添加镜头" onPress={()=>router.replace({pathname:'/creative-project/[id]',params:{id:projectId,tab:'shots',requestId:createId()}})}/></View>:null}

  </View>;
}
