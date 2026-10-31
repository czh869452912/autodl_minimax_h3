import type {AppDatabase} from '../storage/appDatabase';
import {readSemanticReferences} from './semanticDependencies';
import type {SemanticEntity} from './semanticResources';
import {withWriteTransaction} from '../storage/sqliteBusy';
export type SemanticVersionDetail={id:string;version_no:number;content:string;references:Awaited<ReturnType<typeof readSemanticReferences>>};
export async function readSemanticVersion(db:AppDatabase,projectId:string,entityId:string,versionId:string):Promise<SemanticVersionDetail>{
 const row=await db.getFirstAsync<{id:string;version_no:number;content:string}>('SELECT v.id,v.version_no,v.content FROM creative_semantic_versions v JOIN creative_semantic_entities e ON e.id=v.entity_id WHERE v.id=? AND v.entity_id=? AND e.project_id=?',versionId,entityId,projectId);
 if(!row)throw new Error('SEMANTIC_VERSION_MISMATCH');
 return {...row,references:await readSemanticReferences(db,row.id,projectId)};
}
export async function readSemanticVersionPage(db:AppDatabase,projectId:string,entityId:string,before=Number.MAX_SAFE_INTEGER){
 const rows=await db.getAllAsync<{id:string;version_no:number}>('SELECT v.id,v.version_no FROM creative_semantic_versions v JOIN creative_semantic_entities e ON e.id=v.entity_id WHERE e.project_id=? AND e.id=? AND v.version_no<? ORDER BY v.version_no DESC LIMIT 21',projectId,entityId,before);
 const items=await Promise.all(rows.slice(0,20).map(row=>readSemanticVersion(db,projectId,entityId,row.id)));
 return {items,next:rows.length>20?items.at(-1)!.version_no:null};
}
export function readSemanticDetail(db:AppDatabase,projectId:string,entityId:string){
 return withWriteTransaction(db,async tx=>{
  const entity=await tx.getFirstAsync<SemanticEntity>('SELECT * FROM creative_semantic_entities WHERE id=? AND project_id=?',entityId,projectId);
  if(!entity)throw new Error('SEMANTIC_NOT_FOUND');
  const page=await readSemanticVersionPage(tx,projectId,entityId);
  const adopted=entity.current_version_id?await readSemanticVersion(tx,projectId,entityId,entity.current_version_id):null;
  const bindings=await tx.getAllAsync<{shot_id:string;revision:number;title:string;version_no:number;stale:number}>(`SELECT s.id AS shot_id,s.revision,s.title,v.version_no,
   CASE WHEN e.current_version_id IS NOT NULL AND b.version_id!=e.current_version_id THEN 1 ELSE 0 END AS stale
   FROM creative_shot_semantics b JOIN creative_shots s ON s.id=b.shot_id AND s.deleted_at IS NULL
   JOIN creative_semantic_versions v ON v.id=b.version_id JOIN creative_semantic_entities e ON e.id=b.entity_id
   WHERE b.entity_id=? ORDER BY s.sort_key,s.id`,entityId);
  return {entity,page,adopted,bindings};
 });
}
