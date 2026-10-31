import type {AppDatabase} from '../storage/appDatabase';
import {readCreativeDraft,readDraftInputs} from './drafts';
import {creativeVideoWorkflowId} from './videoWorkflow';

/** Local diagnostics only. Never reads secrets, probes providers or grants execution. */
export async function readDraftReadiness(db:AppDatabase,draftId:string,projectId:string) {
  const draft=await readCreativeDraft(db,draftId);
  if(!draft || draft.project_id!==projectId)throw new Error('AGENT_PROJECT_SCOPE_MISMATCH');
  const reasons:Array<{code:string;action:string;versionId?:string}>=[];
  if(!await db.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',projectId))reasons.push({code:'PROJECT_UNAVAILABLE',action:'open_project'});
  if(draft.state!=='EDITING')reasons.push({code:'DRAFT_NOT_EDITABLE',action:draft.job_id?'inspect_original_job':'open_draft'});
  const inputs=await readDraftInputs(db,draftId);
  for(const input of inputs)if(input.state!=='AVAILABLE')reasons.push({code:'INPUT_UNAVAILABLE',versionId:input.version_id,action:'restore_original'});
  const account=await db.getFirstAsync<{credential_generation_id:string}>(`SELECT d.credential_generation_id FROM creative_default_accounts d
    JOIN creative_credential_generations g ON g.id=d.credential_generation_id AND g.status='active' WHERE d.provider_id=?`,draft.provider_id);
  if(!account)reasons.push({code:'ACCOUNT_NOT_BOUND',action:'configure_account'});
  if(draft.provider_id==='autodl'){
    const active=await db.getFirstAsync<{version:string;content_hash:string}>('SELECT version,content_hash FROM workflow_registry_active WHERE workflow_id=?',creativeVideoWorkflowId(draft.workflow_id));
    if(!active)reasons.push({code:'WORKFLOW_UNAVAILABLE',action:'open_workflows'});
    else {
      let input:any;try{input=JSON.parse(draft.input_json);}catch{reasons.push({code:'INPUT_INVALID',action:'open_draft'});}
      if(input?.schemaVersion===2 && (input.workflow?.version!==active.version || input.workflow?.contentHash!==active.content_hash))reasons.push({code:'WORKFLOW_CHANGED',action:'review_workflow'});
    }
  }
  return {status:reasons.length?'blocked':'needs_preparation',reasons,draftId,revision:draft.revision,
    inputs:inputs.map(i=>({versionId:i.version_id,sha256:i.blob_sha256,slot:i.slot,state:i.state})),
    account:account?'bound_not_verified':'not_bound',cost:{mode:'request_limit_only',amountMaximum:null},
    remainingChecks:['validate_actual_parameters','verify_original_bytes','resolve_exact_credential','prepare_request','check_authorization_at_dispatch'],
    executionAllowed:false};
}
