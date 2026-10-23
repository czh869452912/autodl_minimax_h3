import { z } from 'zod';
import type { AppDatabase } from '../storage/appDatabase';
import { applyDraftCommand, videoDraftInput } from './drafts';
import { applyStoryCommand } from './story';
const id=z.string().min(1).max(200), revision=z.number().int().nonnegative();
export const planSchemas={
  'plan.createSelection':z.object({projectId:id,shotId:id,expectedShotRevision:revision,title:z.string().trim().min(1).max(200),candidateVersionIds:z.array(id).min(1).max(20),videoPrompt:z.string().trim().min(1).max(10000),authorizationId:id.optional()}).strict(),
  'plan.resolveSelection':z.object({decisionId:id,versionId:id,expectedRevision:revision}).strict(),
  'plan.cancel':z.object({id,expectedRevision:revision}).strict(),
  'plan.resume':z.object({id,expectedRevision:revision,authorizationId:id}).strict(),
};
export type PlanCommand={[K in keyof typeof planSchemas]:{name:K;payload:z.input<typeof planSchemas[K]>}}[keyof typeof planSchemas];
export type CreativePlan={id:string;project_id:string;shot_id:string;title:string;revision:number;state:string;execution_epoch:string;authorization_id:string|null};
export type CreativePlanStep={id:string;plan_id:string;kind:string;revision:number;state:string;draft_id:string|null;job_id:string|null;input_binding_json:string;result_binding_json:string;error_json:string|null};
export type CreativeDecision={id:string;plan_id:string;step_id:string;revision:number;plan_revision:number;step_revision:number;expected_shot_revision:number;state:string;selected_version_id:string|null};
export function planVideoInput(bindingJson:string){
  const binding=JSON.parse(bindingJson);
  // v25 plans stored only the prompt; preserve their original defaults.
  return videoDraftInput.parse(binding.videoInput??{schemaVersion:1,prompt:binding.prompt,resolution:'480p竖',duration:5,seed:''});
}
export function planVideoSummary(bindingJson:string){
  const input=planVideoInput(bindingJson);
  return `H3 · ${input.resolution} · ${input.duration} 秒 · ${input.seed?'种子 '+input.seed:'随机种子'}`;
}
async function epoch(tx:AppDatabase){const r=await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1');if(!r)throw new Error('EXECUTION_EPOCH_MISSING');return r.epoch;}
async function activePlan(tx:AppDatabase,id:string){
  const p=await tx.getFirstAsync<CreativePlan>('SELECT * FROM creative_plans WHERE id=?',id);
  if(!p||p.state!=='ACTIVE'||p.execution_epoch!==await epoch(tx))throw new Error('PLAN_NOT_ACTIVE');
  if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',p.project_id))throw new Error('PROJECT_NOT_AVAILABLE');
  return p;
}
async function candidate(tx:AppDatabase,versionId:string,projectId:string){
  if(!await tx.getFirstAsync(`SELECT v.id FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id AND a.kind='image'
    JOIN creative_project_assets p ON p.asset_id=a.id AND p.project_id=? JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE'
    JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' AND r.state='AVAILABLE'
    WHERE v.id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)`,projectId,versionId))throw new Error('DECISION_CANDIDATE_UNAVAILABLE');
}
export async function applyPlanCommand(tx:AppDatabase,name:string,p:any,now:number,makeId:()=>string,commandId:string):Promise<Record<string,string>>{
  if(name==='plan.createSelection'){
    if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',p.projectId))throw new Error('PROJECT_NOT_AVAILABLE');
    if(!await tx.getFirstAsync('SELECT id FROM creative_shots WHERE id=? AND project_id=? AND revision=? AND deleted_at IS NULL',p.shotId,p.projectId,p.expectedShotRevision))throw new Error('SHOT_REVISION_CONFLICT');
    if(new Set(p.candidateVersionIds).size!==p.candidateVersionIds.length)throw new Error('DUPLICATE_CANDIDATES');
    for(const versionId of p.candidateVersionIds)await candidate(tx,versionId,p.projectId);
    if(p.authorizationId&&!await tx.getFirstAsync("SELECT id FROM creative_authorizations WHERE id=? AND project_id=? AND provider_id='autodl'",p.authorizationId,p.projectId))throw new Error('PLAN_AUTHORIZATION_MISMATCH');
    const planId=makeId(),selectionId=makeId(),videoId=makeId(),decisionId=makeId(),executionEpoch=await epoch(tx);
    await tx.runAsync("INSERT INTO creative_plans VALUES(?,?,?,?,0,'ACTIVE',?,?,?,?)",planId,p.projectId,p.shotId,p.title,executionEpoch,p.authorizationId??null,now,now);
    await tx.runAsync("INSERT INTO creative_plan_steps VALUES(?,?,'selection',0,'WAITING_DECISION',NULL,NULL,'{}','{}',NULL)",selectionId,planId);
    await tx.runAsync("INSERT INTO creative_plan_steps VALUES(?,?,'video',0,'PENDING',NULL,NULL,?,'{}',NULL)",videoId,planId,JSON.stringify({prompt:p.videoPrompt,videoInput:planVideoInput(JSON.stringify({prompt:p.videoPrompt}))}));
    await tx.runAsync('INSERT INTO creative_plan_dependencies VALUES(?,?)',videoId,selectionId);
    await tx.runAsync("INSERT INTO creative_decision_requests VALUES(?,?,?,0,0,0,?,'WAITING',NULL,NULL,?,?)",decisionId,planId,selectionId,p.expectedShotRevision,now,now);
    for(const versionId of p.candidateVersionIds)await tx.runAsync('INSERT INTO creative_decision_candidates VALUES(?,?)',decisionId,versionId);
    return {planId,decisionId};
  }
  if(name==='plan.resolveSelection'){
    const d=await tx.getFirstAsync<CreativeDecision>('SELECT * FROM creative_decision_requests WHERE id=?',p.decisionId);
    if(!d||d.state!=='WAITING'||d.revision!==p.expectedRevision)throw new Error('DECISION_REVISION_CONFLICT');
    const plan=await activePlan(tx,d.plan_id);
    if(plan.revision!==d.plan_revision)throw new Error('PLAN_REVISION_CONFLICT');
    if(!await tx.getFirstAsync("SELECT id FROM creative_plan_steps WHERE id=? AND revision=? AND state='WAITING_DECISION'",d.step_id,d.step_revision))throw new Error('STEP_REVISION_CONFLICT');
    if(!await tx.getFirstAsync('SELECT version_id FROM creative_decision_candidates WHERE decision_id=? AND version_id=?',d.id,p.versionId))throw new Error('NOT_A_DECISION_CANDIDATE');
    await candidate(tx,p.versionId,plan.project_id);
    await applyStoryCommand(tx,'shot.selectOutput',{id:plan.shot_id,expectedRevision:d.expected_shot_revision,slot:'selected_image',versionId:p.versionId},now,makeId);
    const next=await tx.getFirstAsync<CreativePlanStep>("SELECT s.* FROM creative_plan_steps s JOIN creative_plan_dependencies d ON d.step_id=s.id WHERE d.depends_on_step_id=? AND s.kind='video' AND s.state='PENDING'",d.step_id);
    if(!next)throw new Error('PLAN_DEPENDENCY_INVALID');
    const draft=await applyDraftCommand(tx,'draft.createVideo',{projectId:plan.project_id,shotId:plan.shot_id,versionId:p.versionId,prompt:JSON.parse(next.input_binding_json).prompt},now,makeId);
    await applyDraftCommand(tx,'draft.updateVideo',{id:draft.draftId,expectedRevision:0,input:planVideoInput(next.input_binding_json)},now,makeId);
    const binding=JSON.stringify({versionId:p.versionId});
    await tx.runAsync("UPDATE creative_plan_steps SET state='SUCCEEDED',revision=revision+1,result_binding_json=? WHERE id=?",binding,d.step_id);
    await tx.runAsync("UPDATE creative_plan_steps SET state='READY',revision=revision+1,draft_id=?,input_binding_json=? WHERE id=?",draft.draftId,JSON.stringify({...JSON.parse(next.input_binding_json),versionId:p.versionId}),next.id);
    await tx.runAsync("UPDATE creative_decision_requests SET state='RESOLVED',revision=revision+1,selected_version_id=?,resolved_command_id=?,updated_at=? WHERE id=?",p.versionId,commandId,now,d.id);
    await tx.runAsync('INSERT INTO creative_selection_outbox VALUES(?,?,?,NULL,?)',`selection:${d.id}`,next.id,plan.execution_epoch,now);
    await tx.runAsync('UPDATE executor_wake_state SET generation=generation+1,requested_at=? WHERE singleton=1',now);
    return {planId:plan.id,draftId:draft.draftId,stepId:next.id};
  }
  const plan=await activePlan(tx,p.id);
  if(plan.revision!==p.expectedRevision)throw new Error('PLAN_REVISION_CONFLICT');
  if(name==='plan.cancel'){
    if(await tx.getFirstAsync("SELECT id FROM creative_plan_steps WHERE plan_id=? AND state='DISPATCHED'",plan.id))throw new Error('请先在任务中心处理已提交的生成任务');
    await tx.runAsync("UPDATE creative_plans SET state='CANCELLED',revision=revision+1,updated_at=? WHERE id=?",now,plan.id);
    await tx.runAsync("UPDATE creative_plan_steps SET state='CANCELLED',revision=revision+1 WHERE plan_id=? AND state NOT IN ('SUCCEEDED','FAILED')",plan.id);
    await tx.runAsync("UPDATE creative_decision_requests SET state='CANCELLED',revision=revision+1,updated_at=? WHERE plan_id=? AND state='WAITING'",now,plan.id);
  }else if(name==='plan.resume'){
    const step=await tx.getFirstAsync<CreativePlanStep>("SELECT * FROM creative_plan_steps WHERE plan_id=? AND kind='video' AND state='BLOCKED' AND job_id IS NULL",plan.id);
    if(!step||!await tx.getFirstAsync("SELECT id FROM creative_authorizations WHERE id=? AND project_id=? AND provider_id='autodl' AND revoked_at IS NULL AND expires_at>? AND execution_epoch=?",p.authorizationId,plan.project_id,now,plan.execution_epoch))throw new Error('PLAN_RESUME_REQUIRES_AUTHORIZATION');
    await tx.runAsync('UPDATE creative_plans SET authorization_id=?,revision=revision+1,updated_at=? WHERE id=?',p.authorizationId,now,plan.id);
    await tx.runAsync("UPDATE creative_plan_steps SET state='READY',revision=revision+1,error_json=NULL WHERE id=?",step.id);
    await tx.runAsync('UPDATE executor_wake_state SET generation=generation+1,requested_at=? WHERE singleton=1',now);
  }else throw new Error('UNKNOWN_CREATIVE_COMMAND');
  return {planId:plan.id};
}
