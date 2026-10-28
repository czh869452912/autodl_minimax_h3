import type { AppDatabase } from '../storage/appDatabase';

export type HistoryCursor = { createdAt: number; id: string };
export type HistoryScope = { assetIds: string[]; jobId?: string };
export type HistoryPage = { ids: string[]; stamp: string; next?: HistoryCursor };

// Read only identities and file state before deciding whether recipes need loading.
// The cursor is immutable: a new result cannot shift already visited pages.
export async function readResultHistoryPage(db: AppDatabase, options: HistoryScope & { after?: HistoryCursor; before?: HistoryCursor; availableOnly?:boolean; query?: string; limit?: number }): Promise<HistoryPage> {
  const ids=[...new Set(options.assetIds)];
  if(!ids.length)return {ids:[],stamp:'[]'};
  const cursor=options.before??options.after, comparison=options.before?'>':'<', order=options.before?'ASC':'DESC';
  const limit=Math.min(100,Math.max(1,options.limit??40));
  type Row={id:string;created_at:number;state:string;blob_sha256:string|null};
  const found:Row[]=[];
  for(let offset=0;offset<ids.length;offset+=200){
    const batch=ids.slice(offset,offset+200);
    const recipe="CASE WHEN json_valid(v.recipe_json) THEN v.recipe_json ELSE '{}' END";
    found.push(...await db.getAllAsync<Row>(`SELECT v.id,v.created_at,COALESCE(r.state,f.state) AS state,f.blob_sha256
      FROM creative_asset_versions v
      LEFT JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original'
      LEFT JOIN creative_version_files f ON f.version_id=v.id AND f.role='original'
      WHERE v.asset_id IN (${batch.map(()=>'?').join(',')})
      AND (?=0 OR COALESCE(r.state,f.state)='AVAILABLE')
      AND (? IS NULL OR json_extract(${recipe},'$.jobId')=?)
      AND (?='' OR instr(lower(COALESCE(json_extract(${recipe},'$.input.prompt'),'') || ' ' || COALESCE(json_extract(${recipe},'$.output.seed'),json_extract(${recipe},'$.input.seed'),'') || ' ' || v.version_no),lower(?))>0)
      AND (? IS NULL OR v.created_at${comparison}? OR (v.created_at=? AND v.id${comparison}?))
      ORDER BY v.created_at ${order},v.id ${order} LIMIT ?`,...batch,options.availableOnly?1:0,options.jobId??null,options.jobId??null,options.query??'',options.query??'',cursor?.createdAt??null,cursor?.createdAt??null,cursor?.createdAt??null,cursor?.id??null,limit+1));
  }
  found.sort((a,b)=>(options.before?-1:1)*(b.created_at-a.created_at||(a.id<b.id?1:a.id>b.id?-1:0)));
  const rows=found.slice(0,limit),last=rows[rows.length-1];
  return {ids:rows.map(r=>r.id),stamp:JSON.stringify(rows),next:found.length>limit&&last?{createdAt:last.created_at,id:last.id}:undefined};
}
