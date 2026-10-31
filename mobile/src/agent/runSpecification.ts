import CryptoJS from 'crypto-js';
import {H3_GRAPH_VERSION,type H3AgentConfig} from './agentTypes';
import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';

export async function pinRunRuntime(db:AppDatabase,threadId:string,runId:string,config:H3AgentConfig,skillHash:string,toolNames:string[]){
 // Endpoint may contain private routing information. Persist only its fingerprint, never API keys.
 const snapshot=JSON.stringify({schemaVersion:1,graphVersion:H3_GRAPH_VERSION,model:config.model,endpointHash:CryptoJS.SHA256(config.endpoint).toString(),timeoutMs:config.timeoutMs,maxRetries:config.maxRetries,contextWindowTokens:config.contextWindowTokens??null,maxOutputTokens:config.maxOutputTokens??null,reasoningEffort:config.reasoningEffort??null,skillHash,tools:[...toolNames].sort()});
 await withWriteTransaction(db,async tx=>{
  const prior=await tx.getFirstAsync<{snapshot_json:string}>('SELECT snapshot_json FROM creative_run_runtime_specs WHERE thread_id=? AND run_id=?',threadId,runId);
  if(prior&&prior.snapshot_json!==snapshot)throw new Error('RUN_RUNTIME_CHANGED_START_NEW_RUN');
  if(!prior)await tx.runAsync('INSERT INTO creative_run_runtime_specs VALUES(?,?,?)',threadId,runId,snapshot);
 });
}

export async function assertRunAuthority(db:AppDatabase,threadId:string,runId:string){
 const spec=await db.getFirstAsync<{project_id:string|null;scope_revision:number;execution_epoch:string}>('SELECT * FROM creative_run_specs WHERE thread_id=? AND run_id=?',threadId,runId);
 if(!spec)return; // Legacy runs remain protected by existing skill and command guards.
 const scope=await db.getFirstAsync<{project_id:string|null;revision:number}>('SELECT project_id,revision FROM creative_agent_scopes WHERE thread_id=?',threadId);
 const epoch=await db.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1');
 if(spec.execution_epoch!==epoch?.epoch||spec.project_id!==(scope?.project_id??null)||spec.scope_revision!==(scope?.revision??0))throw new Error('RUN_AUTHORITY_CHANGED_START_NEW_RUN');
}
