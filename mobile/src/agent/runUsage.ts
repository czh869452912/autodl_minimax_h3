import {createMiddleware,countTokensApproximately} from 'langchain';
import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {assertRunAuthority} from './runSpecification';

export const RUN_LIMITS={modelCalls:32,toolCalls:100,estimatedTokens:300000,durationMs:20*60000};
export async function reserveRunCall(db:AppDatabase,threadId:string,runId:string,kind:'model'|'tool',estimatedTokens=0,now=Date.now()){
 if(!Number.isSafeInteger(estimatedTokens)||estimatedTokens<0)throw new Error('RUN_USAGE_INVALID');
 return withWriteTransaction(db,async tx=>{
  await assertRunAuthority(tx,threadId,runId);
  const epoch=await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1');if(!epoch)throw new Error('EXECUTION_EPOCH_MISSING');
  await tx.runAsync('INSERT OR IGNORE INTO creative_run_usage(thread_id,run_id,execution_epoch,started_at,limits_json) VALUES(?,?,?,?,?)',threadId,runId,epoch.epoch,now,JSON.stringify(RUN_LIMITS));
  const row=(await tx.getFirstAsync<{execution_epoch:string;started_at:number;limits_json:string;model_calls:number;tool_calls:number;estimated_tokens:number}>('SELECT * FROM creative_run_usage WHERE thread_id=? AND run_id=?',threadId,runId))!;
  if(row.execution_epoch!==epoch.epoch)throw new Error('RUN_USAGE_RESTORED');
  const limits=JSON.parse(row.limits_json) as typeof RUN_LIMITS;
  if(now-row.started_at>=limits.durationMs)throw new Error('RUN_DURATION_LIMIT');
  if((kind==='model'&&row.model_calls>=limits.modelCalls)||(kind==='tool'&&row.tool_calls>=limits.toolCalls))throw new Error('RUN_CALL_LIMIT');
  if(row.estimated_tokens+estimatedTokens>limits.estimatedTokens)throw new Error('RUN_ESTIMATED_TOKEN_LIMIT');
  await tx.runAsync('UPDATE creative_run_usage SET model_calls=model_calls+?,tool_calls=tool_calls+?,estimated_tokens=estimated_tokens+? WHERE thread_id=? AND run_id=?',kind==='model'?1:0,kind==='tool'?1:0,estimatedTokens,threadId,runId);
 });
}
export function runUsageMiddleware(db:AppDatabase,threadId:string,runId:string,outputTokens:number,networkMetered=false){
 return createMiddleware({name:'DurableRunUsage',
  wrapModelCall:async(request,handler)=>{
   const estimate=countTokensApproximately(request.systemMessage?[request.systemMessage,...request.messages]:request.messages,request.tools)+outputTokens;
   if(!networkMetered)await reserveRunCall(db,threadId,runId,'model',estimate);
   const response=await handler(request);
   const usage=(response as {usage_metadata?:{total_tokens?:number}}).usage_metadata?.total_tokens;
   if(Number.isSafeInteger(usage)&&usage!>=0)await db.runAsync('UPDATE creative_run_usage SET reported_tokens=reported_tokens+? WHERE thread_id=? AND run_id=?',usage!,threadId,runId);
   return response;
  },
  wrapToolCall:async(request,handler)=>{await reserveRunCall(db,threadId,runId,'tool');return handler(request);},
 });
}
