import type {AppDatabase} from '../storage/appDatabase';
import type {ChangeProposal} from './changeReview';

const labels:Record<string,string>={title:'名称',brief:'简报',description:'镜头描述',status:'状态'};
const statuses:Record<string,string>={planned:'待制作',working:'制作中',review:'待审阅',approved:'已批准'};
export const proposalState=(state:string)=>({WAITING:'待审阅',APPLIED:'已采用',REJECTED:'已拒绝',CONFLICT:'内容冲突',EXPIRED:'已过期',QUARANTINED:'恢复后已隔离'} as Record<string,string>)[state]??'待核查';
export function proposalChanges(proposal:ChangeProposal){
  const before=JSON.parse(proposal.before_json) as Record<string,string>,after=JSON.parse(proposal.payload_json) as Record<string,unknown>;
  return Object.keys(before).filter(field=>typeof after[field]==='string'&&before[field]!==after[field]).map(field=>({field,label:labels[field]??field,before:before[field],after:after[field] as string}));
}
export function proposalSubject(proposal:ChangeProposal){
  const before=JSON.parse(proposal.before_json),after=JSON.parse(proposal.payload_json);
  return `${proposal.command_name==='shot.update'?'镜头':'项目'}：${before.title||after.title||'未命名'}`;
}
export const proposalValue=(field:string,value:string)=>field==='status'?statuses[value]??value:value||'（空）';
export type ProposalReview={proposal:ChangeProposal;current:Record<string,string>|null;conflict:boolean};
/** Current content is read for comparison only. Approval still uses the domain transaction. */
export async function readProposalReview(db:AppDatabase,proposal:ChangeProposal):Promise<ProposalReview>{
  const input=JSON.parse(proposal.payload_json);
  const row=proposal.command_name==='shot.update'
    ?await db.getFirstAsync<{title:string;description:string;editorial_status:string;revision:number}>('SELECT title,description,editorial_status,revision FROM creative_shots WHERE id=? AND project_id=? AND deleted_at IS NULL',input.id,proposal.project_id)
    :await db.getFirstAsync<{title:string;brief:string;revision:number}>('SELECT title,brief,revision FROM creative_projects WHERE id=? AND archived_at IS NULL',proposal.project_id);
  const project=await db.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',proposal.project_id);
  const current=row?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='revision').map(([key,value])=>[key==='editorial_status'?'status':key,String(value)])):null;
  return {proposal,current,conflict:proposal.state==='WAITING'&&(!row||!project||row.revision!==input.expectedRevision)};
}
