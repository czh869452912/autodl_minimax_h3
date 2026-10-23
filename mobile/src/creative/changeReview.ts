import {z} from 'zod';
import type {AppDatabase} from '../storage/appDatabase';
import {applyStoryCommand,storySchemas} from './story';
export const reviewSchemas={'change.resolve':z.object({id:z.string().min(1).max(200),accept:z.boolean()}).strict()};
export type ReviewCommand={name:'change.resolve';payload:z.input<typeof reviewSchemas['change.resolve']>};
export type ChangeProposal={id:string;project_id:string;command_name:'project.update'|'shot.update';payload_json:string;before_json:string;state:string};
export async function proposeCreativeChange(tx:AppDatabase,name:'project.update'|'shot.update',p:any,now:number,makeId:()=>string){
  const row=await tx.getFirstAsync<Record<string,any>>(name==='project.update'?'SELECT * FROM creative_projects WHERE id=? AND archived_at IS NULL':'SELECT * FROM creative_shots WHERE id=? AND deleted_at IS NULL',p.id);
  if(!row||row.revision!==p.expectedRevision)throw new Error('REVISION_CONFLICT');
  const projectId=name==='project.update'?p.id:row.project_id;
  if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',projectId))throw new Error('PROJECT_NOT_AVAILABLE');
  const before=name==='project.update'?{title:row.title,brief:row.brief}:{title:row.title,description:row.description,status:row.editorial_status};
  const proposalId=makeId();
  await tx.runAsync("INSERT INTO creative_change_proposals VALUES(?,?,?,?,?,'WAITING',?,NULL)",proposalId,projectId,name,JSON.stringify(p),JSON.stringify(before),now);
  return {proposalId,projectId,reviewState:'WAITING',message:'修改建议已保存，尚未改写项目或镜头。请用户在项目活动中审阅。'};
}
export async function resolveCreativeChange(tx:AppDatabase,p:ReviewCommand['payload'],now:number,makeId:()=>string){
  const proposal=await tx.getFirstAsync<ChangeProposal>('SELECT * FROM creative_change_proposals WHERE id=?',p.id);
  if(!proposal||proposal.state!=='WAITING')throw new Error('PROPOSAL_ALREADY_RESOLVED');
  if(p.accept){
    if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',proposal.project_id))throw new Error('PROJECT_NOT_AVAILABLE');
    const input=JSON.parse(proposal.payload_json);
    if(proposal.command_name==='shot.update')await applyStoryCommand(tx,'shot.update',storySchemas['shot.update'].parse(input),now,makeId);
    else{
      const result=await tx.runAsync('UPDATE creative_projects SET title=?,brief=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',input.title,input.brief,now,input.id,input.expectedRevision);
      if(Number(result.changes)!==1)throw new Error('REVISION_CONFLICT');
    }
  }
  await tx.runAsync('UPDATE creative_change_proposals SET state=?,resolved_at=? WHERE id=?',p.accept?'APPLIED':'REJECTED',now,p.id);
  return {projectId:proposal.project_id,proposalId:p.id};
}
