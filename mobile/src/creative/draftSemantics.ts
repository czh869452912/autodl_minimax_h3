import type {AppDatabase} from '../storage/appDatabase';
import {readShotSemantics} from './semanticResources';

export type SemanticSnapshot={schemaVersion:1;usage?:{textVersions:string[];referenceVersions:string[];initialPrompt:string};items:Array<{entity_id:string;version_id:string;title:string;kind:string;content:string;references:Array<{asset_version_id:string;purpose:string}>}>};
/** null means historical context was not captured; it must not be inferred from today's bindings. */
export async function readDraftSemantics(db:AppDatabase,draftId:string):Promise<SemanticSnapshot|null>{
 const row=await db.getFirstAsync<{snapshot_json:string}>('SELECT snapshot_json FROM creative_draft_semantics WHERE draft_id=?',draftId);
 return row?JSON.parse(row.snapshot_json):null;
}
export async function captureDraftSemantics(tx:AppDatabase,draftId:string,copyFrom?:string,usage?:SemanticSnapshot['usage']){
 if(copyFrom){
  await tx.runAsync('INSERT INTO creative_draft_semantics SELECT ?,snapshot_json FROM creative_draft_semantics WHERE draft_id=?',draftId,copyFrom);
  return;
 }
 const draft=await tx.getFirstAsync<{shot_id:string|null;project_id:string|null}>('SELECT shot_id,project_id FROM creative_generation_drafts WHERE id=?',draftId);
 if(!draft)throw new Error('DRAFT_NOT_FOUND');
 const bindings=draft.shot_id&&draft.project_id?await readShotSemantics(tx,draft.shot_id,draft.project_id):[];
 const items:SemanticSnapshot['items']=[];
 for(const {stale:_,unavailableReferences:__,...binding} of bindings){
  const references=await tx.getAllAsync<{asset_version_id:string;purpose:string}>('SELECT asset_version_id,purpose FROM creative_semantic_references WHERE semantic_version_id=? ORDER BY asset_version_id',binding.version_id);
  items.push({...binding,references});
 }
 items.sort((a,b)=>a.entity_id.localeCompare(b.entity_id));
 await tx.runAsync('INSERT INTO creative_draft_semantics VALUES(?,?)',draftId,JSON.stringify({schemaVersion:1,items,...(usage?{usage}:{})}));
}
