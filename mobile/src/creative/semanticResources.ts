import {z} from 'zod';
import type {AppDatabase} from '../storage/appDatabase';
const id=z.string().min(1).max(200),revision=z.number().int().nonnegative();
const content=z.string().trim().min(1).max(20000);
const references=z.array(z.object({versionId:id,purpose:z.string().trim().min(1).max(100)}).strict()).max(20).default([]);
export const semanticSchemas={
 'semantic.create':z.object({projectId:id,kind:z.enum(['character','scene','style','voice']),title:z.string().trim().min(1).max(200),content,references}).strict(),
 'semantic.revise':z.object({entityId:id,expectedRevision:revision,content,references}).strict(),
 'semantic.adopt':z.object({entityId:id,expectedRevision:revision,versionId:id}).strict(),
 'semantic.bindShot':z.object({shotId:id,expectedShotRevision:revision,entityId:id,versionId:id}).strict(),
};
export type SemanticCommand={[K in keyof typeof semanticSchemas]:{name:K;payload:z.input<typeof semanticSchemas[K]>}}[keyof typeof semanticSchemas];
export type SemanticEntity={id:string;project_id:string;kind:string;title:string;revision:number;current_version_id:string|null};
export async function applySemanticCommand(tx:AppDatabase,name:string,p:any,now:number,makeId:()=>string):Promise<Record<string,string>>{
 let entity:SemanticEntity|undefined;
 if(name!=='semantic.create'){
  entity=await tx.getFirstAsync<SemanticEntity>('SELECT * FROM creative_semantic_entities WHERE id=?',p.entityId)??undefined;
  if(!entity)throw new Error('SEMANTIC_NOT_FOUND');
  if(name!=='semantic.bindShot'&&entity.revision!==p.expectedRevision)throw new Error('REVISION_CONFLICT');
 }
 const projectId=entity?.project_id??p.projectId;
 if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',projectId))throw new Error('PROJECT_NOT_AVAILABLE');
 if(name==='semantic.adopt'||name==='semantic.bindShot'){
  if(!await tx.getFirstAsync('SELECT id FROM creative_semantic_versions WHERE id=? AND entity_id=?',p.versionId,p.entityId))throw new Error('SEMANTIC_VERSION_MISMATCH');
  if(name==='semantic.adopt')await tx.runAsync('UPDATE creative_semantic_entities SET current_version_id=?,revision=revision+1,updated_at=? WHERE id=?',p.versionId,now,p.entityId);
  else {
   const existing=await tx.getFirstAsync('SELECT entity_id FROM creative_shot_semantics WHERE shot_id=? AND entity_id=?',p.shotId,p.entityId);
   if(!existing&&(await tx.getFirstAsync<{n:number}>('SELECT COUNT(*) AS n FROM creative_shot_semantics WHERE shot_id=?',p.shotId))!.n>=8)throw new Error('SHOT_SEMANTIC_LIMIT');
   const changed=await tx.runAsync('UPDATE creative_shots SET revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=? AND deleted_at IS NULL',now,p.shotId,projectId,p.expectedShotRevision);
   if(changed.changes!==1)throw new Error('SHOT_REVISION_CONFLICT');
   await tx.runAsync('INSERT INTO creative_shot_semantics VALUES(?,?,?) ON CONFLICT(shot_id,entity_id) DO UPDATE SET version_id=excluded.version_id',p.shotId,p.entityId,p.versionId);
  }
  return {entityId:p.entityId,versionId:p.versionId,projectId};
 }
 for(const ref of p.references){
  if(!await tx.getFirstAsync(`SELECT v.id FROM creative_asset_versions v JOIN creative_project_assets a ON a.asset_id=v.asset_id AND a.project_id=?
   WHERE v.id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=v.asset_id)`,projectId,ref.versionId))throw new Error('SEMANTIC_REFERENCE_SCOPE_MISMATCH');
 }
 const entityId=entity?.id??makeId(),versionId=makeId();
 if(!entity)await tx.runAsync('INSERT INTO creative_semantic_entities VALUES(?,?,?,?,0,NULL,?,?)',entityId,projectId,p.kind,p.title,now,now);
 else await tx.runAsync('UPDATE creative_semantic_entities SET revision=revision+1,updated_at=? WHERE id=?',now,entityId);
 const n=(await tx.getFirstAsync<{n:number}>('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM creative_semantic_versions WHERE entity_id=?',entityId))!.n;
 await tx.runAsync('INSERT INTO creative_semantic_versions VALUES(?,?,?,?,?)',versionId,entityId,n,p.content,now);
 for(const ref of p.references)await tx.runAsync('INSERT INTO creative_semantic_references VALUES(?,?,?)',versionId,ref.versionId,ref.purpose);
 return {entityId,versionId,projectId,reviewState:'WAITING'};
}
export async function readSemanticResources(db:AppDatabase,projectId:string,afterId='',limit=30){
 const rows=await db.getAllAsync<SemanticEntity>('SELECT * FROM creative_semantic_entities WHERE project_id=? AND id>? ORDER BY id LIMIT ?',projectId,afterId,Math.min(30,Math.max(1,limit))+1);
 const page=rows.slice(0,Math.min(30,Math.max(1,limit)));
 return {items:page,nextCursor:rows.length>page.length?page.at(-1)!.id:null};
}
export async function readShotSemantics(db:AppDatabase,shotId:string,projectId:string){
 return db.getAllAsync<{entity_id:string;version_id:string;title:string;kind:string;content:string;stale:number}>(`SELECT b.entity_id,b.version_id,e.title,e.kind,v.content,
  CASE WHEN e.current_version_id IS NOT NULL AND e.current_version_id!=b.version_id THEN 1 ELSE 0 END AS stale
  FROM creative_shot_semantics b JOIN creative_shots s ON s.id=b.shot_id AND s.project_id=? AND s.deleted_at IS NULL
  JOIN creative_semantic_entities e ON e.id=b.entity_id AND e.project_id=s.project_id JOIN creative_semantic_versions v ON v.id=b.version_id WHERE b.shot_id=?`,projectId,shotId);
}
