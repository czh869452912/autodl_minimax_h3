import type {AppDatabase} from '../storage/appDatabase';
import {readCreativeJobBinding} from './boundExecution';
export async function resolveCreativeQueryCredential(db:AppDatabase,jobId:string,resolve:(generationId:string,use:'query')=>Promise<{token:string;generationId:string;accountId:string;provider:string}>){
  const binding=await readCreativeJobBinding(db,jobId);
  if(!binding){
    if(await db.getFirstAsync('SELECT job_id FROM creative_job_contexts WHERE job_id=?',jobId))throw new Error('CREATIVE_ACCOUNT_BINDING_MISSING');
    return null;
  }
  const identity=await resolve(binding.credential_generation_id,'query');
  if(identity.accountId!==binding.account_binding_id||identity.generationId!==binding.credential_generation_id)throw new Error('ACCOUNT_IDENTITY_MISMATCH');
  return identity;
}
