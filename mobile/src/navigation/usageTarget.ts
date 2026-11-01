import type {UsageEdge} from '../creative/usageGraph';
export type ProjectTab='brief'|'shots'|'assets'|'plans'|'activity';
export type UsageTarget=
 |{pathname:'/creative-project/[id]';params:{id:string;tab:ProjectTab;requestId:string;shotId?:string}}
 |{pathname:'/project-settings-library';params:{projectId:string;versionId:string}}
 |{pathname:'/image-draft/[id]'|'/creative-draft/[id]'|'/creative-task/[id]';params:{id:string}}
 |{pathname:'/project-timeline';params:{projectId:string;timelineId:string}};
export function usageTarget(edge:Pick<UsageEdge,'kind'|'object_id'|'project_id'|'provider_id'>,requestId:string):UsageTarget{
 const project=()=>{if(!edge.project_id)throw Error('使用位置缺少所属项目');return edge.project_id;};
 switch(edge.kind){
  case '项目':return {pathname:'/creative-project/[id]',params:{id:edge.object_id,tab:'assets',requestId}};
  case '封面':return {pathname:'/creative-project/[id]',params:{id:edge.object_id,tab:'brief',requestId}};
  case '镜头':return {pathname:'/creative-project/[id]',params:{id:project(),tab:'shots',shotId:edge.object_id,requestId}};
  case '设定版本':return {pathname:'/project-settings-library',params:{projectId:project(),versionId:edge.object_id}};
  case '草稿输入':return {pathname:edge.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:edge.object_id}};
  case '任务冻结输入':return {pathname:'/creative-task/[id]',params:{id:edge.object_id}};
  case '时间线':return {pathname:'/project-timeline',params:{projectId:project(),timelineId:edge.object_id}};
  default:{const unsupported:never=edge.kind;throw Error('无法定位使用位置：'+unsupported);}
 }
}
