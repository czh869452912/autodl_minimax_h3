import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
// Live facts remain authoritative. A changed signature hides old derived text immediately.
const sources=`SELECT 'shot:'||s.id AS source_key,'shot' AS kind,s.id AS object_id,NULL AS version_id,s.title,
 s.title||char(10)||s.description AS text,json_array(s.title,s.description,s.revision) AS fingerprint,NULL AS blob_sha256,NULL AS relative_path,NULL AS mime
 FROM creative_shots s WHERE s.project_id=? AND s.deleted_at IS NULL
 UNION ALL SELECT 'semantic:'||v.id,'semantic',e.id,v.id,e.title,e.title||char(10)||v.content,json_array(e.title,v.content),NULL,NULL,NULL
 FROM creative_semantic_versions v JOIN creative_semantic_entities e ON e.id=v.entity_id WHERE e.project_id=?
 UNION ALL SELECT 'asset:'||v.id,'asset',a.id,v.id,a.title,a.title||char(10)||COALESCE(d.description,'')||char(10)||COALESCE(d.tags_json,''),
 json_array(a.title,d.description,d.tags_json,f.blob_sha256),f.blob_sha256,b.relative_path,b.mime
 FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id JOIN creative_project_assets p ON p.asset_id=a.id
 JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE'
 JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' AND r.state='AVAILABLE'
 JOIN artifact_blobs b ON b.sha256=f.blob_sha256 LEFT JOIN creative_asset_descriptions d ON d.asset_id=a.id
 WHERE p.project_id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)`;
export type SearchSource={source_key:string;kind:'shot'|'semantic'|'asset';object_id:string;version_id:string|null;title:string;text:string;fingerprint:string;blob_sha256:string|null;relative_path:string|null;mime:string|null};
export async function rebuildSearchPage(db:AppDatabase,projectId:string,readText:(source:SearchSource)=>Promise<string>,after=''){
 const rows=await db.getAllAsync<SearchSource>(`SELECT * FROM (${sources}) WHERE source_key>? ORDER BY source_key LIMIT 31`,projectId,projectId,projectId,after);
 const page=rows.slice(0,30);let indexed=0;const unavailable:string[]=[];
 for(const row of page){
  let content=row.text;
  if(row.mime==='text/plain')try{const body=await readText(row);if(body.length>102400)throw Error('TEXT_TOO_LARGE');content+='\n'+body;}catch{unavailable.push(row.source_key);await db.runAsync('DELETE FROM creative_search_documents WHERE project_id=? AND source_key=?',projectId,row.source_key);continue;}
  await withWriteTransaction(db,async tx=>{
   const current=await tx.getFirstAsync<SearchSource>(`SELECT * FROM (${sources}) WHERE source_key=?`,projectId,projectId,projectId,row.source_key);
   if(current?.fingerprint!==row.fingerprint){unavailable.push(row.source_key);return;}
   await tx.runAsync('INSERT INTO creative_search_documents VALUES(?,?,?,?,?) ON CONFLICT(project_id,source_key) DO UPDATE SET fingerprint=excluded.fingerprint,content=excluded.content,updated_at=excluded.updated_at',projectId,row.source_key,row.fingerprint,content,Date.now());indexed++;
  });
 }
 return {indexed,unavailable,next:rows.length>30?page[page.length-1].source_key:undefined};
}
export async function searchProject(db:AppDatabase,projectId:string,query:string,after=''){
 const terms=query.trim().split(/\s+/).filter(Boolean);if(!terms.length||terms.length>8||query.length>200)throw Error('SEARCH_QUERY_INVALID');
 const rows=await db.getAllAsync<SearchSource&{content:string}>(`WITH live AS (${sources}) SELECT live.*,i.content FROM live JOIN creative_search_documents i ON i.source_key=live.source_key AND i.project_id=? AND i.fingerprint=live.fingerprint
 WHERE live.source_key>? AND ${terms.map(()=>"instr(lower(i.content),lower(?))>0").join(' AND ')} ORDER BY live.source_key LIMIT 31`,projectId,projectId,projectId,projectId,after,...terms);
 const last=rows[29];
 const coverage=await db.getFirstAsync<{total:number;indexed:number}>(`WITH live AS (${sources}) SELECT COUNT(*) AS total,COUNT(i.source_key) AS indexed FROM live LEFT JOIN creative_search_documents i ON i.source_key=live.source_key AND i.project_id=? AND i.fingerprint=live.fingerprint`,projectId,projectId,projectId,projectId);
 return {items:rows.slice(0,30).map(({content,source_key,kind,object_id,version_id,title})=>{const at=content.toLowerCase().indexOf(terms[0].toLowerCase());return {key:source_key,kind,objectId:object_id,versionId:version_id,title,excerpt:content.slice(Math.max(0,at-40),Math.max(0,at-40)+240)};}),next:rows.length>30?last.source_key:undefined,coverage,searchMode:'local-full-text',untrustedReferenceData:true};
}
