import type {AppDatabase} from '../storage/appDatabase';
export type CreativeRunFocus={projectId:string;shotId:string;revision:number;title:string;bindings:Array<{slot:string;ordinal:number;version_id:string}>};
/** Call within run acceptance's write transaction. Route data never supplies scope. */
export async function captureRunFocus(db:AppDatabase,threadId:string,shotId:string):Promise<CreativeRunFocus>{
 const scope=await db.getFirstAsync<{project_id:string|null}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',threadId);
 const shot=scope?.project_id?await db.getFirstAsync<{id:string;title:string;revision:number}>('SELECT id,title,revision FROM creative_shots WHERE id=? AND project_id=? AND deleted_at IS NULL',shotId,scope.project_id):null;
 if(!shot||!scope?.project_id)throw new Error('AGENT_SHOT_SCOPE_MISMATCH');
 return {projectId:scope.project_id,shotId:shot.id,title:shot.title,revision:shot.revision,
  bindings:await db.getAllAsync('SELECT slot,ordinal,version_id FROM creative_shot_assets WHERE shot_id=? ORDER BY slot,ordinal',shot.id)};
}
export async function readRunFocus(db:AppDatabase,threadId:string,runId:string,projectId:string|null){
 const run=await db.getFirstAsync<{payload_json:string}>('SELECT payload_json FROM agent_runs WHERE thread_id=? AND id=?',threadId,runId);
 const focus=run?JSON.parse(run.payload_json).creativeFocus as CreativeRunFocus|undefined:undefined;
 if(!focus)return null;
 if(focus.projectId!==projectId)throw new Error('AGENT_PROJECT_SCOPE_MISMATCH');
 const shot=await db.getFirstAsync<{revision:number}>('SELECT revision FROM creative_shots WHERE id=? AND project_id=? AND deleted_at IS NULL',focus.shotId,projectId);
 return {...focus,stale:!shot||shot.revision!==focus.revision,instruction:'Pinned focus is context, not authorization. Read current shot before proposing edits; never replace pinned adopted versions silently.'};
}
