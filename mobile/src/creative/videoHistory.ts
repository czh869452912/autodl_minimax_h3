import type {AppDatabase} from '../storage/appDatabase';
import type {CreativeDraft} from './drafts';
import type {AssetVersion} from './types';
import {videoSession} from './videoDraftState';

export type VideoHistoryJob={id:string;status:string;created_at:number;started_at:number|null;execution_duration:number|null;updated_at:number};
export type VideoHistoryRound={draft:CreativeDraft;job:VideoHistoryJob;versions:AssetVersion[];ordinal?:number};

/** Jobs and media summaries are batched. Original recipes are loaded by the selected result only. */
export async function readVideoHistory(db:AppDatabase,source:CreativeDraft,options?:{after?:{createdAt:number;id:string};jobId?:string;limit?:number}){
  const session=videoSession(JSON.parse(source.input_json),source.target_asset_id??source.id);
  const drafts=await db.getAllAsync<CreativeDraft & {ordinal:number;history_created:number}>(`WITH scoped AS (SELECT * FROM creative_generation_drafts
    WHERE provider_id=? AND project_id IS ? AND shot_id IS ? AND state!='DISCARDED' AND job_id IS NOT NULL
    AND ((CASE WHEN json_extract(input_json,'$.schemaVersion')=2 THEN CAST(json_extract(input_json,'$.sessionId') AS TEXT) ELSE COALESCE(target_asset_id,id) END)=?
      OR (? IS NOT NULL AND target_asset_id=?)) ), numbered AS (SELECT d.*,j.created_at AS history_created,ROW_NUMBER() OVER(ORDER BY j.created_at,j.id) AS ordinal FROM scoped d JOIN workflow_jobs j ON j.id=d.job_id WHERE d.id=(SELECT s.id FROM scoped s WHERE s.job_id=d.job_id ORDER BY s.updated_at DESC,s.id DESC LIMIT 1)) SELECT * FROM numbered WHERE (? IS NULL OR history_created<? OR (history_created=? AND job_id<?)) AND (? IS NULL OR job_id=?) ORDER BY history_created DESC,job_id DESC LIMIT ?`,source.provider_id,source.project_id,source.shot_id,session,source.target_asset_id,source.target_asset_id,options?.after?.createdAt??null,options?.after?.createdAt??null,options?.after?.createdAt??null,options?.after?.id??null,options?.jobId??null,options?.jobId??null,options?Math.min(100,options.limit??40)+1:-1);
  const hasMore=Boolean(options&&drafts.length>Math.min(100,options.limit??40));if(hasMore)drafts.pop();
  const last=drafts[drafts.length-1];
  const byJob=new Map<string,CreativeDraft>();
  for(const draft of drafts)if(!byJob.has(draft.job_id!))byJob.set(draft.job_id!,draft);
  const ids=[...byJob.keys()],jobs:VideoHistoryJob[]=[],outputs=new Map<string,AssetVersion[]>();
  type Output={job_id:string;id:string;asset_id:string;version_no:number;created_at:number;source:AssetVersion['source'];state:AssetVersion['state'];blob_sha256?:string;relative_path?:string;mime?:string};
  const add=(rows:Output[])=>{
    for(const row of rows){
      if(byJob.get(row.job_id)?.target_asset_id!==row.asset_id)continue;
      const list=outputs.get(row.job_id)??[];
      if(!list.some(v=>v.id===row.id))list.push({id:row.id,assetId:row.asset_id,versionNo:row.version_no,createdAt:row.created_at,source:row.source,state:row.state??'PENDING',blobSha256:row.blob_sha256,relativePath:row.relative_path,mime:row.mime,recipe:{jobId:row.job_id}});
      outputs.set(row.job_id,list);
    }
  };
  const columns="v.id,v.asset_id,v.version_no,v.created_at,v.source,COALESCE(r.state,f.state) AS state,f.blob_sha256,b.relative_path,b.mime";
  const files="LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' LEFT JOIN artifact_blobs b ON b.sha256=f.blob_sha256";
  for(let offset=0;offset<ids.length;offset+=200){
    const batch=ids.slice(offset,offset+200),marks=batch.map(()=>'?').join(',');
    jobs.push(...await db.getAllAsync<VideoHistoryJob>(`SELECT id,status,created_at,started_at,execution_duration,updated_at FROM workflow_jobs WHERE id IN (${marks})`,...batch));
    add(await db.getAllAsync<Output>(`SELECT l.job_id,${columns} FROM creative_output_links l JOIN creative_asset_versions v ON v.id=l.version_id ${files} WHERE l.job_id IN (${marks}) ORDER BY v.created_at DESC,v.id DESC`,...batch));
    // Older imported generations may only carry recipe.jobId. Do not scan old
    // assets for every pending modern submission that has no output yet.
    const legacy=batch.filter(id=>!outputs.has(id)&&JSON.parse(byJob.get(id)!.input_json).schemaVersion!==2);
    const assets=[...new Set(legacy.map(id=>byJob.get(id)!.target_asset_id).filter((id):id is string=>Boolean(id)))];
    if(legacy.length&&assets.length){
      const job="json_extract(CASE WHEN json_valid(v.recipe_json) THEN v.recipe_json ELSE '{}' END,'$.jobId')";
      add(await db.getAllAsync<Output>(`SELECT ${job} AS job_id,${columns} FROM creative_asset_versions v ${files} WHERE v.asset_id IN (${assets.map(()=>'?').join(',')}) AND ${job} IN (${legacy.map(()=>'?').join(',')}) ORDER BY v.created_at DESC,v.id DESC`,...assets,...legacy));
    }
  }
  const rounds:VideoHistoryRound[]=jobs.map(job=>({job,ordinal:drafts.find(d=>d.job_id===job.id)?.ordinal,draft:byJob.get(job.id)!,versions:outputs.get(job.id)??[]})).sort((a,b)=>b.job.created_at-a.job.created_at||b.job.id.localeCompare(a.job.id));
  return {rounds,next:hasMore&&last?{createdAt:last.history_created,id:last.job_id!}:undefined,stamp:JSON.stringify(rounds.map(r=>[r.draft.id,r.draft.revision,r.job,r.versions]))};
}
