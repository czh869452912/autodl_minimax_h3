// Isolated synthetic Android QA data; never imported by release entry points.
import '../src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import '../src/providers/bootstrap';
import React, {useEffect, useState} from 'react';
import {Text} from 'react-native';
import {registerRootComponent} from 'expo';
import {App} from 'expo-router/build/qualified-entry';
import {getDatabase} from '../src/storage/databaseClient';
import {creativeService} from '../src/creative/runtime';
import {createLocalThreadStore} from '../src/agent/threadStore';
import {bindProjectConversation} from '../src/creative/projectAgentScope';
import {saveSettings} from '../src/settings/storage';

// Request preparation is an explicit offline substitute; never dispatch.
const imageRuntime=require('../src/creative/novelAiRuntime');
const {prepareNovelAiRequest,defaultNovelAiDraft}=require('../src/creative/novelAiProtocol');
imageRuntime.prepareCreativeImage=async id=>{
 const db=getDatabase(),draft=await db.getFirstAsync('SELECT * FROM creative_generation_drafts WHERE id=?',id);
 const request=prepareNovelAiRequest(JSON.parse(draft.input_json),()=>0.5);
 return {db,draft,account:{account_binding_id:'offline-account',credential_generation_id:'offline-generation',identity_mode:'credential_bound'},versionIds:[],prepared:{workflowId:'novelai-image-basic',workflowVersion:'1',inputSnapshot:request.snapshot,requestInput:JSON.parse(request.requestJson),target:{operation:'image.generate'}}};
};
imageRuntime.confirmCreativeImage=async()=>{throw Error('离线采样不提交生成');};
const videoRuntime=require('../src/creative/videoRuntime');
videoRuntime.prepareCreativeVideo=async id=>{
 const db=getDatabase(),draft=await db.getFirstAsync('SELECT * FROM creative_generation_drafts WHERE id=?',id);
 const refs=await db.getAllAsync('SELECT version_id FROM creative_draft_inputs WHERE draft_id=?',id);
 return {db,draft,images:[],audios:[],account:{account_binding_id:'offline-account',credential_generation_id:'offline-generation',identity_mode:'credential_bound'},versionIds:refs.map(r=>r.version_id),prepared:{workflowId:'offline-video',workflowVersion:'1',workflowContentHash:'offline',adapterId:'autodl',adapterVersion:'1',inputSnapshot:{prompt:'Camera follows the lighthouse keeper.',resolution:'720P',duration:6,seed:42},requestInput:{prompt:'Camera follows the lighthouse keeper.'},target:{operation:'video.generate'}}};
};
async function prepare() {
  const db=getDatabase(), service=creativeService(), store=createLocalThreadStore(db);
  await saveSettings({llmEndpoint:'http://10.0.2.2:8877/v1',llmModel:'offline-fixture',llmApiKey:'local-fixture-not-a-secret',llmMaxRetries:'0'});
  if(await store.load('roadmap-review-thread'))return;
  const execute=async(command,key,origin)=>{const result=await service.execute(command,'m3-fixture-'+key,origin);if(result.status!=='completed')throw Error('QA fixture not completed');return result.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'Agent 流程测试',brief:'灯塔短片：保留角色与暖色调。'}},'project');
  const now=Date.now(),run={id:'roadmap-review-run',userMessageId:'m3-user',startedAt:now,status:'running',messageIds:['m3-user','m3-assistant'],tools:[]};
  const snapshot={threadId:'roadmap-review-thread',messages:[{id:'m3-user',role:'user',content:'请改清楚灯塔镜头，并准备一份图片草稿。'},{id:'m3-assistant',role:'assistant',content:'离线测试样本：已准备修改建议和草稿，等待审阅。未调用模型或生成服务。'}],state:{h3Runs:[run]},createdAt:now,updatedAt:now};
  await store.save(snapshot);await bindProjectConversation(db,snapshot.threadId,projectId);
  const origin=key=>({threadId:snapshot.threadId,runId:run.id,toolCallId:key,projectId,scopeRevision:0});
  for(const [key,title] of [['waiting','灯塔远景'],['conflict','海岸近景'],['reject','港口夜景']]){
    const {shotId}=await execute({name:'shot.create',payload:{projectId,title,description:'她望向远处，镜头移动。'}},key+'-shot');
    await execute({name:'shot.update',payload:{id:shotId,expectedRevision:0,title,description:'女孩站在灯塔左侧，朝海面挥手。镜头从全景缓慢推进至中景，保持暖色调。',status:'planned'}},key+'-proposal',origin(key));
    if(key==='conflict')await execute({name:'shot.update',payload:{id:shotId,expectedRevision:0,title,description:'用户已改写：男孩坐在海岸石阶上，镜头固定。',status:'planned'}},'manual-edit');
  }
  await execute({name:'project.update',payload:{id:projectId,expectedRevision:0,title:'Agent 流程测试',brief:'灯塔短片：强调告别，保留角色与暖色调。'}},'project-proposal',origin('project-proposal'));
  const {draftId}=await execute({name:'draft.createImage',payload:{projectId}},'draft',origin('draft')); await execute({name:'draft.updateImage',payload:{id:draftId,expectedRevision:0,input:{...defaultNovelAiDraft,prompt:'A girl waves beside the lighthouse, warm evening light.',seed:42}}},'edit-draft');
  const hash='f'.repeat(64);
  await db.runAsync('INSERT OR IGNORE INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png','cas/'+hash);
  const {versionId}=await execute({name:'asset.import',payload:{projectId,title:'离线参考',kind:'image',blobSha256:hash}},'reference');
  const batchShots=[];
  for(let i=0;i<3;i++){
   const {shotId}=await execute({name:'shot.create',payload:{projectId,title:['灯塔入口','海岸行走','港口告别'][i],description:'Camera follows the lighthouse keeper.'}},'batch-shot-'+i);
   batchShots.push({shotId,expectedShotRevision:0,title:['灯塔入口','海岸行走','港口告别'][i],candidateVersionIds:[versionId],videoPrompt:'Camera follows the lighthouse keeper.'});
  }
  const {batchId}=await execute({name:'plan.createBatch',payload:{projectId,title:'灯塔短片 · 3 镜头',shots:batchShots}},'batch');
  const members=await db.getAllAsync('SELECT plan_id FROM creative_plan_batch_members WHERE batch_id=? ORDER BY ordinal',batchId);
  for(let i=0;i<2;i++){
   const decision=await db.getFirstAsync('SELECT * FROM creative_decision_requests WHERE plan_id=?',members[i].plan_id);
   await execute({name:'plan.resolveSelection',payload:{decisionId:decision.id,expectedRevision:0,versionId}},'select-'+i);
  }
  await execute({name:'plan.setPaused',payload:{id:members[1].plan_id,expectedRevision:0,paused:true}},'pause');
  await store.save({...snapshot,state:{h3Runs:[{...run,status:'completed',endedAt:Date.now()}]}});
}
function Root(){const [ready,setReady]=useState(false),[error,setError]=useState('');useEffect(()=>{prepare().then(()=>setReady(true),e=>setError(e.stack??String(e)));},[]);return ready?<App/>:<Text>{error||'准备 M3 离线审阅样本…'}</Text>;}
registerRootComponent(Root);
