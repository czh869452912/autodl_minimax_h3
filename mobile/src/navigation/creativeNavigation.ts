import type {router} from 'expo-router';
type Router=typeof router;
import {creativeService} from '../creative/runtime';

// Root Stack identifies project screens by ID; query anchors never change identity.
export const projectScreenIdentity=(_name:string,params:Record<string,unknown>)=>String(params.id??'');
export type ProjectTarget={projectId:string;shotId?:string;planId?:string;proposalId?:string};
export async function returnToProject(router:Router,target:ProjectTarget){
 const project=await creativeService().project(target.projectId);
 if(!project){router.dismissTo('/(tabs)/projects');return;}
 router.dismissTo({pathname:'/creative-project/[id]',params:{id:project.id,tab:target.planId?'plans':target.proposalId?'activity':'shots',shotId:target.shotId,planId:target.planId,proposalId:target.proposalId,requestId:String(Date.now())}});
}
