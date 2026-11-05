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

async function prepare() {
  const db=getDatabase(), service=creativeService(), store=createLocalThreadStore(db);
  await saveSettings({llmEndpoint:'http://10.0.2.2:8877/v1',llmModel:'offline-fixture',llmApiKey:'local-fixture-not-a-secret',llmMaxRetries:'0'});
  if(await store.load('m3-review-thread'))return;
  const execute=async(command,key,origin)=>{const result=await service.execute(command,'m3-fixture-'+key,origin);if(result.status!=='completed')throw Error('QA fixture not completed');return result.value;};
  const {projectId}=await execute({name:'project.create',payload:{title:'M3 审阅测试',brief:'灯塔短片：保留角色与暖色调。'}},'project');
  const now=Date.now(),run={id:'m3-review-run',userMessageId:'m3-user',startedAt:now,status:'running',messageIds:['m3-user','m3-assistant'],tools:[]};
  const snapshot={threadId:'m3-review-thread',messages:[{id:'m3-user',role:'user',content:'请改清楚灯塔镜头，并准备一份图片草稿。'},{id:'m3-assistant',role:'assistant',content:'离线测试样本：已准备修改建议和草稿，等待审阅。未调用模型或生成服务。'}],state:{h3Runs:[run]},createdAt:now,updatedAt:now};
  await store.save(snapshot);await bindProjectConversation(db,snapshot.threadId,projectId);
  const origin=key=>({threadId:snapshot.threadId,runId:run.id,toolCallId:key,projectId,scopeRevision:0});
  for(const [key,title] of [['waiting','灯塔远景'],['conflict','海岸近景'],['reject','港口夜景']]){
    const {shotId}=await execute({name:'shot.create',payload:{projectId,title,description:'她望向远处，镜头移动。'}},key+'-shot');
    await execute({name:'shot.update',payload:{id:shotId,expectedRevision:0,title,description:'女孩站在灯塔左侧，朝海面挥手。镜头从全景缓慢推进至中景，保持暖色调。',status:'planned'}},key+'-proposal',origin(key));
    if(key==='conflict')await execute({name:'shot.update',payload:{id:shotId,expectedRevision:0,title,description:'用户已改写：男孩坐在海岸石阶上，镜头固定。',status:'planned'}},'manual-edit');
  }
  await execute({name:'project.update',payload:{id:projectId,expectedRevision:0,title:'M3 审阅测试',brief:'灯塔短片：强调告别，保留角色与暖色调。'}},'project-proposal',origin('project-proposal'));
  await execute({name:'draft.createImage',payload:{projectId}},'draft',origin('draft'));
  await store.save({...snapshot,state:{h3Runs:[{...run,status:'completed',endedAt:Date.now()}]}});
}
function Root(){const [ready,setReady]=useState(false),[error,setError]=useState('');useEffect(()=>{prepare().then(()=>setReady(true),e=>setError(e.stack??String(e)));},[]);return ready?<App/>:<Text>{error||'准备 M3 离线审阅样本…'}</Text>;}
registerRootComponent(Root);
