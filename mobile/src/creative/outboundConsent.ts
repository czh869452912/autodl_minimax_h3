import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {createId} from '../ids';
export type OutboundScope={projectId:string|null;provider:string;generationId:string;requestHash:string;versions:string[]};
export async function grantOutboundConsent(db:AppDatabase,scope:OutboundScope,now=Date.now()){
 return withWriteTransaction(db,async tx=>{
  if(!/^[a-f0-9]{64}$/.test(scope.requestHash))throw Error('OUTBOUND_REQUEST_INVALID');
  if(!await tx.getFirstAsync("SELECT g.id FROM creative_credential_generations g JOIN creative_default_accounts d ON d.credential_generation_id=g.id WHERE g.id=? AND d.provider_id=? AND g.status='active'",scope.generationId,scope.provider))throw Error('OUTBOUND_ACCOUNT_CHANGED');
  const manifest=[];
  for(const versionId of [...new Set(scope.versions)].sort()){
   const row=await tx.getFirstAsync<{version_id:string;blob_sha256:string}>(`SELECT f.version_id,f.blob_sha256 FROM creative_version_files f JOIN creative_asset_versions v ON v.id=f.version_id WHERE f.version_id=? AND f.role='original' AND f.state='AVAILABLE' AND (? IS NULL OR EXISTS(SELECT 1 FROM creative_project_assets p WHERE p.project_id=? AND p.asset_id=v.asset_id)) AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=v.asset_id)`,versionId,scope.projectId,scope.projectId);
   if(!row)throw Error('OUTBOUND_SOURCE_UNAVAILABLE');manifest.push(row);
  }
  const epoch=(await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1'))!.epoch;
  const id=createId();await tx.runAsync('INSERT INTO creative_outbound_consents VALUES(?,?,?,?,?,?,?,?,NULL,?)',id,scope.projectId,scope.provider,scope.generationId,epoch,scope.requestHash,JSON.stringify(manifest),now+15*60000,now);return id;
 });
}
export async function assertJobOutboundConsent(tx:AppDatabase,jobId:string,scope:Omit<OutboundScope,'versions'>,now:number){
 const context=await tx.getFirstAsync('SELECT job_id FROM creative_job_contexts WHERE job_id=?',jobId);if(!context)return;
 const permit=await tx.getFirstAsync<{manifest_json:string}>(`SELECT c.manifest_json FROM creative_outbound_consents c JOIN creative_execution_state e ON e.epoch=c.execution_epoch WHERE c.project_id IS ? AND c.provider_id=? AND c.generation_id=? AND c.request_hash=? AND c.revoked_at IS NULL AND c.expires_at>? ORDER BY c.created_at DESC LIMIT 1`,scope.projectId,scope.provider,scope.generationId,scope.requestHash,now);
 if(!permit)throw Error('OUTBOUND_CONSENT_REQUIRED');
 const refs=await tx.getAllAsync<{version_id:string;blob_sha256:string}>(`SELECT DISTINCT i.version_id,f.blob_sha256 FROM creative_job_inputs i JOIN creative_version_files f ON f.version_id=i.version_id AND f.role='original' WHERE i.job_id=? ORDER BY i.version_id`,jobId);
 if(JSON.stringify(refs)!==permit.manifest_json)throw Error('OUTBOUND_MANIFEST_CHANGED');
}
