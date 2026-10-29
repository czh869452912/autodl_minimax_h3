import * as SecureStore from 'expo-secure-store';
import {createAppWorkflowCatalog} from '../workflows/registry/builtin';
import {registryRecordToDefinition} from '../workflows/registry/catalog';
import {createWorkflowRegistry} from '../workflows/registry/repository';
import {getDatabase} from '../storage/databaseClient';
import {defaultAutodlCredential} from './accountRuntime';
import {creativeVideoWorkflowId} from './videoWorkflow';
import {alignVideoState,videoWorkflowReason,workflowVideoInput} from './videoDraftState';
import type {CreativeDraft} from './drafts';
import type {RegistryRecord} from '../workflows/registry/types';
import type {WorkflowDefinition} from '../workflows/schema/types';
import {creativeService} from './runtime';
import {createId} from '../ids';
import {H3_CREATIVE_WORKFLOW_ID} from './videoWorkflow';

export type VideoWorkflowEntry={record:RegistryRecord;definition:WorkflowDefinition;reason:string};
const preference='creative.video.workflow';
export async function listVideoWorkflows():Promise<VideoWorkflowEntry[]>{
  const catalog=createAppWorkflowCatalog();await catalog.bootstrap();
  return (await catalog.listActive()).map(record=>({record,definition:registryRecordToDefinition(record)})).filter(item=>item.definition.outputs.artifacts.some(output=>output.kind==='video')).map(item=>({...item,reason:videoWorkflowReason(item.definition)}));
}
export async function videoAccountReady(){try{return Boolean(await defaultAutodlCredential(getDatabase()));}catch{return false;}}
export async function rememberVideoWorkflow(id:string){await SecureStore.setItemAsync(preference,id);}
export async function preferredVideoWorkflow(){return SecureStore.getItemAsync(preference);}
export async function createVideoWorkbenchDraft(prompt:string,commandKey=createId()){
  const old=await getDatabase().getFirstAsync<{result_json:string}>('SELECT result_json FROM creative_command_receipts WHERE idempotency_key=?',commandKey);
  if(old)return JSON.parse(old.result_json) as Awaited<ReturnType<ReturnType<typeof creativeService>['execute']>>;
  const available=(await listVideoWorkflows()).filter(item=>!item.reason),preferred=await preferredVideoWorkflow();
  const entry=available.find(item=>item.record.workflowId===preferred)??available.find(item=>item.record.workflowId===H3_CREATIVE_WORKFLOW_ID)??available[0];
  if(!entry)throw new Error('没有可用的视频工作流，请在设置中导入或同步');
  const {input}=alignVideoState(entry.record,entry.definition,commandKey,{prompt});
  return creativeService().execute({name:'draft.createVideo',payload:{input}},commandKey);
}
export async function resolveVideoWorkbench(row:CreativeDraft,entries:VideoWorkflowEntry[]){
  const raw=JSON.parse(row.input_json),entry=entries.find(item=>item.record.workflowId===creativeVideoWorkflowId(row.workflow_id));
  if(!entry)throw new Error('原工作流不可用，输入已保留；请恢复工作流，或选择其他工作流继续');
  if(raw.schemaVersion!==2){const aligned=alignVideoState(entry.record,entry.definition,row.target_asset_id??row.id,raw);return {entry,input:aligned.input,notices:aligned.notices,stale:false};}
  const input=workflowVideoInput.parse(raw),stale=input.workflow.version!==entry.record.version || input.workflow.contentHash!==entry.record.contentHash;
  if(stale){
    const pinned=await createWorkflowRegistry(getDatabase()).get(input.workflow.id,input.workflow.version);
    if(pinned?.contentHash===input.workflow.contentHash)return {entry:{...entry,definition:registryRecordToDefinition(pinned)},input,notices:[],stale};
  }
  return {entry,input,notices:[],stale};
}
