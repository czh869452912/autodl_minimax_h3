import type {AppDatabase} from '../storage/appDatabase';
import type {CreativePlan} from './plans';

export type PlanCursor={createdAt:number;id:string};
export type PlanFilter='all'|'unfinished'|'failed';
export async function readPlanPage(db:AppDatabase,projectId:string,options:{planId?:string;batchId?:string;filter?:PlanFilter;after?:PlanCursor}={}){
 const {planId,batchId,after,filter='all'}=options;
 const rows=await db.getAllAsync<CreativePlan & {created_at:number}>(`SELECT p.* FROM creative_plans p
 WHERE p.project_id=? AND (? IS NULL OR p.id=?)
 AND (? IS NULL OR EXISTS(SELECT 1 FROM creative_plan_batch_members m JOIN creative_plan_batches b ON b.id=m.batch_id WHERE m.plan_id=p.id AND b.id=? AND b.project_id=p.project_id))
 AND (?='all' OR (?='unfinished' AND p.state='ACTIVE') OR (?='failed' AND p.state='ACTIVE' AND EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=p.id AND s.state='FAILED')))
 AND (? IS NULL OR p.created_at<? OR (p.created_at=? AND p.id<?)) ORDER BY p.created_at DESC,p.id DESC LIMIT 31`,projectId,planId??null,planId??null,batchId??null,batchId??null,filter,filter,filter,after?.createdAt??null,after?.createdAt??null,after?.createdAt??null,after?.id??null);
 const items=rows.slice(0,30),last=items[items.length-1];
 return {items,next:rows.length>30&&last?{createdAt:last.created_at,id:last.id}:undefined};
}
export type PlanBatchSummary={id:string;title:string;created_at:number;total:number;completed:number;failed:number;active:number;blocked:number};
export async function readPlanBatchPage(db:AppDatabase,projectId:string,after?:PlanCursor){
 const rows=await db.getAllAsync<PlanBatchSummary>(`SELECT b.*,COUNT(p.id) AS total,
 SUM(p.state='COMPLETED') AS completed,SUM(p.state='ACTIVE') AS active,
 SUM(p.state='ACTIVE' AND EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=p.id AND s.state='FAILED')) AS failed,
 SUM(p.state='ACTIVE' AND EXISTS(SELECT 1 FROM creative_plan_steps s WHERE s.plan_id=p.id AND s.state='BLOCKED')) AS blocked
 FROM creative_plan_batches b JOIN creative_plan_batch_members m ON m.batch_id=b.id JOIN creative_plans p ON p.id=m.plan_id AND p.project_id=b.project_id
 WHERE b.project_id=? AND (? IS NULL OR b.created_at<? OR (b.created_at=? AND b.id<?)) GROUP BY b.id ORDER BY b.created_at DESC,b.id DESC LIMIT 21`,projectId,after?.createdAt??null,after?.createdAt??null,after?.createdAt??null,after?.id??null);
 const items=rows.slice(0,20),last=items[items.length-1];
 return {items,next:rows.length>20&&last?{createdAt:last.created_at,id:last.id}:undefined};
}
