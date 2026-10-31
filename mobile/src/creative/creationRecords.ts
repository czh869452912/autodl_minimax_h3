import type { AppDatabase } from '../storage/appDatabase';
import type { CreativeDraft } from './drafts';

/** Count the entire session in SQLite; transfer only its newest editable snapshot. */
export type CreationCursor={updatedAt:number;id:string;stamp?:string};
export type CreationQuery={after?:CreationCursor;limit?:number;query?:string;mode?:'all'|'image'|'video'};
export async function readCreationRecords(db: AppDatabase, options:CreationQuery={}) {
  const rows = await db.getAllAsync<CreativeDraft & { generations: number }>(`
    WITH eligible AS (
      SELECT d.*, CASE WHEN provider_id != 'novelai' AND json_extract(input_json,'$.schemaVersion')=2
        THEN COALESCE(json_extract(input_json,'$.sessionId'),id) ELSE COALESCE(target_asset_id,id) END AS session_key
      FROM creative_generation_drafts d WHERE state!='DISCARDED'
      AND (job_id IS NOT NULL OR target_asset_id IS NOT NULL OR shot_id IS NOT NULL
        OR length(trim(COALESCE(json_extract(input_json,'$.prompt'),json_extract(input_json,'$.values.prompt'),'')))>0
        OR json_extract(input_json,'$.sourceVersionId') IS NOT NULL
        OR EXISTS(SELECT 1 FROM creative_draft_inputs i WHERE i.draft_id=d.id)
        OR EXISTS(SELECT 1 FROM json_each(input_json,'$.characters') c
          WHERE json_extract(c.value,'$.enabled')=1 AND length(trim(json_extract(c.value,'$.prompt')))>0))
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY provider_id,project_id,shot_id,session_key ORDER BY updated_at DESC,id DESC) AS position,
        COUNT(job_id) OVER (PARTITION BY provider_id,project_id,shot_id,session_key) AS generations FROM eligible
    ) SELECT ranked.*,(SELECT title FROM creative_projects WHERE id=ranked.project_id) AS project_title,
      (SELECT title FROM creative_shots WHERE id=ranked.shot_id AND deleted_at IS NULL) AS shot_title
      FROM ranked WHERE position=1
      AND (?='all' OR (CASE WHEN provider_id='novelai' THEN 'image' ELSE 'video' END)=?)
      AND instr(lower(input_json || COALESCE((SELECT title FROM creative_projects WHERE id=ranked.project_id),'') || COALESCE((SELECT title FROM creative_shots WHERE id=ranked.shot_id),'')),lower(?))>0
      AND (? IS NULL OR updated_at<? OR (updated_at=? AND id<?))
      ORDER BY updated_at DESC,id DESC LIMIT ?
  `,options.mode??'all',options.mode??'all',options.query?.trim()??'',options.after?.updatedAt??null,options.after?.updatedAt??null,options.after?.updatedAt??null,options.after?.id??null,Math.min(101,Math.max(1,options.limit??31)));
  return rows.map(({ generations, ...draft }) => ({ draft, generations }));
}

/** A rebuildable revision signature invalidates cursors when sessions or source context change. */
export async function readCreationRecordPage(db:AppDatabase,options:CreationQuery={}){
 const revision=await db.getFirstAsync<{stamp:string}>(`SELECT
   (SELECT COUNT(*) || ':' || COALESCE(SUM(revision),0) || ':' || COALESCE(MAX(updated_at),0) FROM creative_generation_drafts) || ':' ||
   (SELECT COUNT(*) || ':' || COALESCE(SUM(revision),0) FROM creative_projects) || ':' ||
   (SELECT COUNT(*) || ':' || COALESCE(SUM(revision),0) FROM creative_shots) AS stamp`);
 const stamp=revision?.stamp??'empty';
 const reset=Boolean(options.after&&options.after.stamp!==stamp);
 const limit=Math.min(100,Math.max(1,options.limit??30));
 const rows=await readCreationRecords(db,{...options,after:reset?undefined:options.after,limit:limit+1});
 const items=rows.slice(0,limit),last=items[items.length-1]?.draft;
 return {items,reset,stamp,next:rows.length>limit&&last?{updatedAt:last.updated_at??0,id:last.id,stamp}:undefined};
}
