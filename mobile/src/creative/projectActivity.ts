import type {AppDatabase} from '../storage/appDatabase';
export type ProjectActivity={id:string;kind:'command'|'generation'|'plan';label:string;state:string;createdAt:number;origin:string;jobId?:string;draftId?:string;provider?:string};
/** Derived only from durable facts; no chat text is interpreted as completion. */
export async function readProjectActivity(db:AppDatabase,projectId:string):Promise<ProjectActivity[]>{
  const commands=await db.getAllAsync<{id:string;command_name:string;result_json:string;created_at:number;origin_kind:string;review_state:string|null}>(`SELECT r.*,o.origin_kind,p.state AS review_state FROM creative_command_receipts r JOIN creative_execution_origins o ON o.id=r.execution_origin_id LEFT JOIN creative_change_proposals p ON p.id=json_extract(r.result_json,'$.value.proposalId')
    WHERE json_extract(r.result_json,'$.value.projectId')=? OR json_extract(r.result_json,'$.value.draftId') IN (SELECT id FROM creative_generation_drafts WHERE project_id=?)
    OR json_extract(r.result_json,'$.value.shotId') IN (SELECT id FROM creative_shots WHERE project_id=?)
    OR json_extract(r.result_json,'$.value.planId') IN (SELECT id FROM creative_plans WHERE project_id=?)
    ORDER BY r.created_at DESC LIMIT 50`,projectId,projectId,projectId,projectId);
  const jobs=await db.getAllAsync<{job_id:string;draft_id:string|null;created_at:number;status:string;provider_id:string;outputs:number}>(`SELECT c.job_id,c.draft_id,c.created_at,j.status,d.provider_id,(SELECT COUNT(*) FROM creative_output_links l WHERE l.job_id=c.job_id) AS outputs
    FROM creative_job_contexts c JOIN workflow_jobs j ON j.id=c.job_id LEFT JOIN creative_generation_drafts d ON d.id=c.draft_id WHERE c.project_id=? ORDER BY c.created_at DESC LIMIT 50`,projectId);
  const plans=await db.getAllAsync<{id:string;title:string;state:string;updated_at:number}>('SELECT * FROM creative_plans WHERE project_id=? ORDER BY updated_at DESC LIMIT 30',projectId);
  return [
    ...commands.map(r=>({id:r.id,kind:'command' as const,label:r.command_name,state:r.review_state?({WAITING:'建议待审阅，尚未应用',APPLIED:'修改已采用',REJECTED:'建议已拒绝'} as Record<string,string>)[r.review_state]??r.review_state:'已保存',createdAt:r.created_at,origin:r.origin_kind,draftId:JSON.parse(r.result_json).value?.draftId})),
    ...jobs.map(r=>({id:r.job_id,kind:'generation' as const,label:r.provider_id==='novelai'?'NovelAI 图片生成':'H3 视频生成',state:['SUCCEEDED','PARTIAL_SUCCEEDED'].includes(r.status)?r.outputs?`已归档 ${r.outputs} 个候选`:'远端完成，等待归档':r.status,createdAt:r.created_at,origin:'executor',jobId:r.job_id,draftId:r.draft_id??undefined,provider:r.provider_id})),
    ...plans.map(r=>({id:r.id,kind:'plan' as const,label:r.title,state:r.state,createdAt:r.updated_at,origin:'plan'})),
  ].sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id)).slice(0,100);
}
