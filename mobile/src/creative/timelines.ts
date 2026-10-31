import {applyRenderCommand} from './timelineRender';
import {z} from 'zod';
import type {AppDatabase} from '../storage/appDatabase';
const id=z.string().min(1).max(200);
export const timelineSpec=z.object({schemaVersion:z.literal(1),orientation:z.enum(['portrait','landscape']),
 clips:z.array(z.object({versionId:id,startMs:z.number().int().min(0).max(3600000),durationMs:z.number().int().min(250).max(120000),caption:z.string().max(500)}).strict()).min(1).max(20),
 audio:z.object({versionId:id,startMs:z.number().int().min(0).max(3600000),volume:z.number().min(0).max(1)}).strict().nullable(),
}).strict().refine(s=>s.clips.reduce((n,c)=>n+c.durationMs,0)<=120000,'时间线总时长最多 120 秒');
export type TimelineSpec=z.infer<typeof timelineSpec>;
export const timelineSchemas={
 'timeline.render':z.object({id}).strict(),
 'timeline.cancelRender':z.object({id}).strict(),
 'timeline.create':z.object({projectId:id,title:z.string().trim().min(1).max(200),spec:timelineSpec}).strict(),
 'timeline.discard':z.object({id}).strict(),
};
export type TimelineCommand={[K in keyof typeof timelineSchemas]:{name:K;payload:z.input<typeof timelineSchemas[K]>}}[keyof typeof timelineSchemas];
export async function applyTimelineCommand(tx:AppDatabase,name:string,p:any,now:number,makeId:()=>string){
 if(name==='timeline.render'||name==='timeline.cancelRender')return applyRenderCommand(tx,name,p.id,now,makeId);
 if(name==='timeline.discard'){
  if(await tx.getFirstAsync("SELECT id FROM creative_timeline_renders WHERE timeline_id=? AND state IN ('QUEUED','RENDERING')",p.id))throw new Error('TIMELINE_RENDER_ACTIVE');
  const result=await tx.runAsync('UPDATE creative_timelines SET discarded_at=? WHERE id=? AND discarded_at IS NULL',now,p.id);
  if(result.changes!==1)throw new Error('TIMELINE_NOT_AVAILABLE');
  await tx.runAsync("DELETE FROM artifact_blob_refs WHERE owner_type='creative_timeline' AND owner_id=?",p.id);
  return {timelineId:p.id as string};
 }
 if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',p.projectId))throw new Error('PROJECT_NOT_AVAILABLE');
 const spec=timelineSpec.parse(p.spec),timelineId=makeId();
 const inputs=new Map<string,{hash:string;kind:string}>();
 for(const ref of [...spec.clips.map(c=>({id:c.versionId,kind:'video'})),...(spec.audio?[{id:spec.audio.versionId,kind:'audio'}]:[])]){
  const row=await tx.getFirstAsync<{blob_sha256:string;kind:string}>(`SELECT f.blob_sha256,a.kind FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id
   JOIN creative_project_assets p ON p.asset_id=a.id AND p.project_id=? JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE'
   JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' AND r.state='AVAILABLE'
   WHERE v.id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)`,p.projectId,ref.id);
  if(!row||row.kind!==ref.kind)throw new Error('TIMELINE_INPUT_UNAVAILABLE');
  inputs.set(ref.id,{hash:row.blob_sha256,kind:row.kind});
 }
 await tx.runAsync('INSERT INTO creative_timelines VALUES(?,?,?,?,?,NULL)',timelineId,p.projectId,p.title,JSON.stringify(spec),now);
 for(const [versionId,input] of inputs){
  await tx.runAsync('INSERT INTO creative_timeline_inputs VALUES(?,?,?)',timelineId,versionId,input.hash);
  await tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'creative_timeline',?,?)",input.hash,timelineId,now);
 }
 return {timelineId};
}
export type TimelineRow={id:string;project_id:string;title:string;spec_json:string;created_at:number;discarded_at:number|null};
export async function readTimelinePage(db:AppDatabase,projectId:string,after?:{createdAt:number;id:string}){
 const rows=await db.getAllAsync<TimelineRow>('SELECT * FROM creative_timelines WHERE project_id=? AND discarded_at IS NULL AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21',projectId,after?.createdAt??null,after?.createdAt??null,after?.createdAt??null,after?.id??null);
 const items=rows.slice(0,20),last=items[items.length-1];return {items,next:rows.length>20?{createdAt:last.created_at,id:last.id}:undefined};
}
export async function timelineManifest(db:AppDatabase,id:string,projectId:string){
 const row=await db.getFirstAsync<TimelineRow>('SELECT * FROM creative_timelines WHERE id=? AND project_id=?',id,projectId);
 if(!row)throw new Error('TIMELINE_NOT_FOUND');
 const inputs=await db.getAllAsync<{version_id:string;blob_sha256:string;mime:string;byte_size:number}>(`SELECT i.version_id,i.blob_sha256,b.mime,b.byte_size FROM creative_timeline_inputs i JOIN artifact_blobs b ON b.sha256=i.blob_sha256 WHERE i.timeline_id=? ORDER BY i.version_id`,id);
 return {format:'autodl-timeline',version:1,title:row.title,timelineId:id,projectId,spec:timelineSpec.parse(JSON.parse(row.spec_json)),inputs};
}
