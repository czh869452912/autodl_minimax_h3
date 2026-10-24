import type {AppDatabase} from '../storage/appDatabase';

export type TaskCredentialBinding={accountId:string;generationId:string;provider:string};

/** Older records without a binding retain their compatibility fallback. New intents pin an exact generation. */
export async function resolveTaskCredential(db:AppDatabase,jobId:string,use:'dispatch'|'query',resolve:(id:string,use:'dispatch'|'query')=>Promise<TaskCredentialBinding & {token:string}>){
  const row=await db.getFirstAsync<{payload_json:string}>("SELECT payload_json FROM workflow_operations WHERE job_id=? AND kind='SUBMIT' ORDER BY created_at,id LIMIT 1",jobId);
  const binding=row?JSON.parse(row.payload_json).credentialBinding:undefined;
  if(binding===undefined)return null;
  if(!binding || !['accountId','generationId','provider'].every(key=>typeof binding[key]==='string' && binding[key].length>0))throw new Error('TASK_ACCOUNT_BINDING_INVALID');
  const identity=await resolve(binding.generationId,use);
  if(identity.accountId!==binding.accountId || identity.generationId!==binding.generationId || identity.provider!==binding.provider)throw new Error('ACCOUNT_IDENTITY_MISMATCH');
  return identity;
}
