import type { AppDatabase } from '../storage/appDatabase';
import { createCreativeService } from './service';
import type { CreativeDraft } from './drafts';
import type { AssetVersion } from './types';

export type AgentCreativeActivity = { id:string; runId?:string; name:string; draft?:CreativeDraft; jobId?:string; status?:string; projectId?:string; outputs:AssetVersion[] };

/** Read durable command receipts and archived outputs, never the assistant's claim of completion. */
export async function readAgentCreativeActivity(db:AppDatabase,threadId:string):Promise<AgentCreativeActivity[]> {
  const scope=await db.getFirstAsync<{project_id:string|null;revision:number}>('SELECT project_id,revision FROM creative_agent_scopes WHERE thread_id=?',threadId);
  if(!scope?.project_id)return [];
  const receipts=await db.getAllAsync<{id:string;run_id:string;result_json:string}>(`SELECT r.id,o.run_id,r.result_json FROM creative_command_receipts r
    JOIN creative_execution_origins o ON o.id=r.execution_origin_id WHERE o.thread_id=?
    AND (r.command_name LIKE 'draft.%' OR r.command_name LIKE 'plan.%' OR r.command_name IN ('project.update','shot.update'))
    ORDER BY r.created_at DESC,r.rowid DESC LIMIT 100`,threadId);
  const service=createCreativeService(db),cards:AgentCreativeActivity[]=[],seen=new Set<string>();
  for(const row of receipts){
    const result=JSON.parse(row.result_json);
    const jobId=result.execution?.kind==='generation'?result.execution.jobId:undefined;
    const draft=result.value?.draftId?await service.draft(result.value.draftId):jobId?await db.getFirstAsync<CreativeDraft>('SELECT * FROM creative_generation_drafts WHERE job_id=?',jobId):null;
    if(draft && draft.state!=='DISCARDED' && draft.project_id===scope.project_id && !seen.has(draft.id)){
      seen.add(draft.id);
      const job=draft.job_id?await db.getFirstAsync<{status:string}>('SELECT status FROM workflow_jobs WHERE id=?',draft.job_id):null;
      const links=draft.job_id?await db.getAllAsync<{version_id:string}>('SELECT version_id FROM creative_output_links WHERE job_id=? ORDER BY artifact_id',draft.job_id):[];
      const ids=new Set(links.map(link=>link.version_id));
      const outputs=draft.target_asset_id?(await service.versions(draft.target_asset_id)).filter(version=>ids.has(version.id)):[];
      cards.push({id:draft.id,runId:row.run_id,name:draft.provider_id==='novelai'?'图片创作':'视频创作',draft,jobId:draft.job_id??undefined,status:job?.status,outputs});
    }else if(result.value?.planId || result.value?.proposalId){
      const id=result.value.planId??result.value.proposalId;
      if(seen.has(id))continue;
      const object=result.value.planId
        ?await db.getFirstAsync<{project_id:string;state:string}>('SELECT project_id,state FROM creative_plans WHERE id=?',id)
        :await db.getFirstAsync<{project_id:string;state:string}>('SELECT project_id,state FROM creative_change_proposals WHERE id=?',id);
      if(object?.project_id===scope.project_id && ['ACTIVE','WAITING'].includes(object.state)){
        seen.add(id);cards.push({id,runId:row.run_id,name:result.value.planId?'选图与后续制作':'修改建议待审阅',projectId:object.project_id,outputs:[]});
      }
    }
    if(cards.length>=20)break;
  }
  const current=await db.getFirstAsync<{project_id:string|null;revision:number}>('SELECT project_id,revision FROM creative_agent_scopes WHERE thread_id=?',threadId);
  return current?.project_id===scope.project_id && current.revision===scope.revision ? cards : [];
}

export function agentCreativeActivityLabel(card:AgentCreativeActivity):string {
  const available=card.outputs.filter(output=>output.state==='AVAILABLE' && output.relativePath);
  if(available.length)return `已有 ${available.length} 个成果可查看${card.status==='PARTIAL_SUCCEEDED'?' · 部分完成':card.status==='FAILED'?' · 任务失败':''}`;
  if(card.status==='SUCCEEDED'||card.status==='PARTIAL_SUCCEEDED')return card.outputs.length?'生成已完成 · 原文件待恢复':'生成已完成 · 正在归档成果';
  if(card.status)return ({READY_TO_SUBMIT:'等待提交',SUBMITTING:'正在提交',QUEUED:'排队中',RUNNING:'正在生成',FAILED:'生成失败 · 查看原因',UNKNOWN:'结果不确定 · 需要核查',CANCELLED:'已取消'} as Record<string,string>)[card.status]??'正在读取生成状态';
  return card.draft?'仅保存草稿 · 尚未提交生成':card.name;
}

export function agentCreativeActivitySummary(cards:AgentCreativeActivity[]):string {
  const outputs=cards.reduce((count,card)=>count+card.outputs.filter(output=>output.state==='AVAILABLE' && output.relativePath).length,0);
  const pending=cards.filter(card=>card.status && ['READY_TO_SUBMIT','SUBMITTING','QUEUED','RUNNING'].includes(card.status));
  if(outputs)return `${outputs} 个成果可查看${pending.length?` · ${pending.length} 个任务进行中`:''}`;
  return cards.length?agentCreativeActivityLabel(pending[0]??cards[0]):'尚无生成任务';
}
