import type {AppDatabase} from '../storage/appDatabase';
import type {WorkflowOperation} from '../workflows/executor/types';
import type {ArtifactCasBlob} from '../media/cas';
import {insertWorkflowOperation} from '../workflows/executor/operationInsert';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {timelineSpec,type TimelineRow,type TimelineSpec} from './timelines';
export type RenderInput={version_id:string;blob_sha256:string;relative_path:string};
export async function applyRenderCommand(tx:AppDatabase,name:string,id:string,now:number,makeId:()=>string){
 if(name==='timeline.cancelRender'){
  const row=await tx.getFirstAsync<{operation_id:string}>("SELECT operation_id FROM creative_timeline_renders WHERE id=? AND state IN ('QUEUED','RENDERING')",id);
  if(!row)throw new Error('RENDER_NOT_ACTIVE');
  await tx.runAsync("UPDATE creative_timeline_renders SET state='CANCELLED',updated_at=? WHERE id=?",now,id);
  await tx.runAsync("UPDATE workflow_operations SET state='FAILED',lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",now,row.operation_id);
  return {renderId:id};
 }
 const timeline=await tx.getFirstAsync<TimelineRow>('SELECT t.* FROM creative_timelines t JOIN creative_projects p ON p.id=t.project_id WHERE t.id=? AND t.discarded_at IS NULL AND p.archived_at IS NULL',id);
 if(!timeline)throw new Error('TIMELINE_NOT_AVAILABLE');
 const existing=await tx.getFirstAsync<{id:string}>("SELECT id FROM creative_timeline_renders WHERE timeline_id=? AND state IN ('QUEUED','RENDERING','SUCCEEDED') ORDER BY created_at DESC LIMIT 1",id);
 if(existing)return {renderId:existing.id};
 const epoch=await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1');
 if(!epoch)throw new Error('EXECUTION_EPOCH_MISSING');
 const renderId=makeId(),operationId=makeId();
 await insertWorkflowOperation(tx,{id:operationId,kind:'EXPORT',idempotencyKey:renderId,payload:{kind:'creative_timeline',renderId},now},'error');
 await tx.runAsync("INSERT INTO creative_timeline_renders VALUES(?,?,?,?,'QUEUED',NULL,NULL,?,?)",renderId,id,operationId,epoch.epoch,now,now);
 await tx.runAsync('UPDATE executor_wake_state SET generation=generation+1,requested_at=? WHERE singleton=1',now);
 return {renderId};
}
type RenderDeps={now():number;id():string;render(spec:TimelineSpec,inputs:RenderInput[],check:()=>Promise<void>):Promise<ArtifactCasBlob>;cancel():Promise<unknown>};
export async function executeTimelineRender(db:AppDatabase,operation:WorkflowOperation,owner:string,deps:RenderDeps){
 if(operation.payload.kind!=='creative_timeline'||typeof operation.payload.renderId!=='string'||operation.jobId)throw new Error('RENDER_OPERATION_INVALID');
 const renderId=operation.payload.renderId;
 const authorized=async(tx:AppDatabase)=>Boolean(await tx.getFirstAsync(`SELECT 1 FROM creative_timeline_renders r JOIN creative_timelines t ON t.id=r.timeline_id
 JOIN creative_projects p ON p.id=t.project_id JOIN workflow_operations o ON o.id=r.operation_id JOIN creative_execution_state e ON e.epoch=r.execution_epoch
 WHERE r.id=? AND o.id=? AND r.state IN ('QUEUED','RENDERING') AND t.discarded_at IS NULL
 AND o.state='CLAIMED' AND o.lease_owner=? AND o.attempt=? AND o.lease_expires_at>?
 AND NOT EXISTS(SELECT 1 FROM creative_restore_quarantine q WHERE q.entity_kind='operation' AND q.entity_id=o.id)`,renderId,operation.id,owner,operation.attempt,deps.now()));
 const check=async()=>{if(!await authorized(db))throw new Error('RENDER_LEASE_LOST');};
 if(!await authorized(db))return;
 const row=await db.getFirstAsync<TimelineRow>('SELECT t.* FROM creative_timelines t JOIN creative_timeline_renders r ON r.timeline_id=t.id WHERE r.id=?',renderId);
 if(!row)throw new Error('TIMELINE_NOT_FOUND');
 let heartbeat:ReturnType<typeof setInterval>|undefined,renewal:Promise<void>|undefined;
 try{
  await withWriteTransaction(db,async tx=>{if(!await authorized(tx))throw new Error('RENDER_LEASE_LOST');await tx.runAsync("UPDATE creative_timeline_renders SET state='RENDERING',updated_at=? WHERE id=?",deps.now(),renderId);});
  heartbeat=setInterval(()=>{if(!renewal)renewal=(async()=>{
   if(!await authorized(db)){await deps.cancel();return;}
   await db.runAsync("UPDATE workflow_operations SET lease_expires_at=? WHERE id=? AND lease_owner=? AND attempt=? AND state='CLAIMED'",deps.now()+120000,operation.id,owner,operation.attempt);
  })().catch(()=>deps.cancel().then(()=>undefined)).finally(()=>{renewal=undefined;});},10000);
  if(!await db.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',row.project_id))throw new Error('PROJECT_ARCHIVED');
  const inputs=await db.getAllAsync<RenderInput>(`SELECT i.version_id,i.blob_sha256,b.relative_path FROM creative_timeline_inputs i JOIN artifact_blobs b ON b.sha256=i.blob_sha256
   JOIN creative_version_files f ON f.version_id=i.version_id AND f.role='original' AND f.state='AVAILABLE' AND f.blob_sha256=i.blob_sha256
   JOIN creative_file_resources fr ON fr.version_id=i.version_id AND fr.role='original' AND fr.state='AVAILABLE'
   JOIN creative_asset_versions v ON v.id=i.version_id JOIN creative_project_assets pa ON pa.asset_id=v.asset_id AND pa.project_id=?
   WHERE i.timeline_id=? AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=v.asset_id)`,row.project_id,row.id);
  const spec=timelineSpec.parse(JSON.parse(row.spec_json));
  if([...spec.clips.map(c=>c.versionId),...(spec.audio?[spec.audio.versionId]:[])].some(id=>!inputs.some(i=>i.version_id===id)))throw new Error('RENDER_INPUT_MISSING');
  const blob=await deps.render(spec,inputs,check);
  await withWriteTransaction(db,async tx=>{
   if(!await authorized(tx))throw new Error('RENDER_LEASE_LOST');
   if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',row.project_id))throw new Error('PROJECT_ARCHIVED');
   const now=deps.now(),assetId=deps.id(),versionId=deps.id();
   await tx.runAsync('INSERT OR IGNORE INTO artifact_blobs VALUES(?,?,?,?,?,?)',blob.sha256,blob.byteSize,blob.mime,blob.relativePath,now,now);
   await tx.runAsync("INSERT INTO creative_assets VALUES(?,'video',?,?,0,?,?)",assetId,row.title+' · 成片',versionId,now,now);
   await tx.runAsync("INSERT INTO creative_asset_versions VALUES(?,?,1,'generated',?,?)",versionId,assetId,JSON.stringify({schemaVersion:1,source:'local-timeline',timelineId:row.id,renderId,spec}),now);
   await tx.runAsync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')",versionId,blob.sha256);
   await tx.runAsync("INSERT INTO artifact_blob_refs VALUES(?,'creative_version',?,?)",blob.sha256,versionId,now);
   await tx.runAsync('INSERT INTO creative_project_assets VALUES(?,?,?,0)',row.project_id,assetId,versionId);
   await tx.runAsync("UPDATE creative_timeline_renders SET state='SUCCEEDED',output_version_id=?,error=NULL,updated_at=? WHERE id=?",versionId,now,renderId);
   await tx.runAsync("UPDATE workflow_operations SET state='SUCCEEDED',lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",now,operation.id);
  });
 }catch(e){
  await withWriteTransaction(db,async tx=>{if(!await authorized(tx))return;const error=e instanceof Error?e.message.slice(0,300):'RENDER_FAILED';
   await tx.runAsync("UPDATE creative_timeline_renders SET state='FAILED',error=?,updated_at=? WHERE id=?",error,deps.now(),renderId);
   await tx.runAsync("UPDATE workflow_operations SET state='FAILED',last_error_json=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",JSON.stringify({code:'RENDER_FAILED',message:error}),deps.now(),operation.id);
  });
 }finally{if(heartbeat)clearInterval(heartbeat);if(renewal)await renewal;}
}
